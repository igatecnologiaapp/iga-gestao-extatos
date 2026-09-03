import { IMPORT_ERRORS, type ParseResult, type ParsedRow } from "./types";
import { normalizeDescription, parseAmount, parseDate, withRowWarnings } from "./shared";

type Cell = string | number | Date | null | undefined;
export type SheetRow = Cell[];

const DATE_KEYS = ["data", "data lancamento", "data movimento", "dt", "date", "data compra"];
const DESC_KEYS = [
  "descricao",
  "historico",
  "lancamento",
  "memo",
  "estabelecimento",
  "detalhe",
  "description",
];
const AMOUNT_KEYS = ["valor", "montante", "amount", "valor r", "valor brl"];
const CREDIT_KEYS = ["credito", "entrada", "receita"];
const DEBIT_KEYS = ["debito", "saida", "despesa"];
const TYPE_KEYS = ["tipo", "natureza", "d c", "dc", "tipo lancamento"];

function header(cell: Cell): string {
  return normalizeDescription(String(cell ?? ""));
}

function findIndex(headers: string[], keys: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    if (!h) continue;
    if (keys.some((k) => h === k)) return i;
  }
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    if (!h) continue;
    if (keys.some((k) => h.includes(k))) return i;
  }
  return -1;
}

/** Converte uma matriz (CSV ou planilha) em linhas de importação. */
export function parseSheetRows(rows: SheetRow[]): ParseResult {
  const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) throw IMPORT_ERRORS.emptyFile();

  // Cabeçalho = primeira linha em que reconhecemos data + valor (ou crédito/débito).
  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(nonEmpty.length, 15); i++) {
    const candidate = nonEmpty[i]!.map(header);
    const hasDate = findIndex(candidate, DATE_KEYS) >= 0;
    const hasValue =
      findIndex(candidate, AMOUNT_KEYS) >= 0 ||
      findIndex(candidate, CREDIT_KEYS) >= 0 ||
      findIndex(candidate, DEBIT_KEYS) >= 0;
    if (hasDate && hasValue) {
      headerIndex = i;
      headers = candidate;
      break;
    }
  }
  if (headerIndex < 0) throw IMPORT_ERRORS.missingColumns();

  const iDate = findIndex(headers, DATE_KEYS);
  const iDesc = findIndex(headers, DESC_KEYS);
  const iAmount = findIndex(headers, AMOUNT_KEYS);
  const iCredit = findIndex(headers, CREDIT_KEYS);
  const iDebit = findIndex(headers, DEBIT_KEYS);
  const iType = findIndex(headers, TYPE_KEYS);

  if (iDesc < 0 && iAmount < 0 && iCredit < 0) throw IMPORT_ERRORS.missingColumns();

  const parsed: ParsedRow[] = [];
  const warnings: string[] = [];

  for (let i = headerIndex + 1; i < nonEmpty.length; i++) {
    const row = nonEmpty[i]!;
    const rawObj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) rawObj[h] = row[idx] ?? null;
    });

    const postedAt = iDate >= 0 ? parseDate(row[iDate] as Cell) : null;
    const description = iDesc >= 0 ? String(row[iDesc] ?? "").trim() : "";
    const rowWarnings: string[] = [];

    let amount: number | null = null;
    let direction: ParsedRow["direction"] = null;

    if (iAmount >= 0) {
      const res = parseAmount(row[iAmount] as string | number);
      amount = res.value;
      if (res.ambiguous) rowWarnings.push("Valor ambíguo — confira antes de confirmar");
      if (amount !== null) direction = res.negative ? "saida" : "entrada";
    }
    if (amount === null && (iCredit >= 0 || iDebit >= 0)) {
      const credit = iCredit >= 0 ? parseAmount(row[iCredit] as string | number) : null;
      const debit = iDebit >= 0 ? parseAmount(row[iDebit] as string | number) : null;
      if (credit?.value) {
        amount = credit.value;
        direction = "entrada";
      } else if (debit?.value) {
        amount = debit.value;
        direction = "saida";
      }
    }

    if (iType >= 0) {
      const t = normalizeDescription(String(row[iType] ?? ""));
      if (t) {
        if (/^(c|credito|entrada|receita)$/.test(t)) direction = "entrada";
        else if (/^(d|debito|saida|despesa)$/.test(t)) direction = "saida";
      }
    }

    // Linhas de total/saldo não são movimentações.
    const normDesc = normalizeDescription(description);
    if (/^(saldo|total|subtotal)\b/.test(normDesc)) continue;
    if (!postedAt && amount === null && !description) continue;

    parsed.push(
      withRowWarnings({
        posted_at: postedAt,
        description,
        amount,
        direction,
        currency: "BRL",
        warnings: rowWarnings,
        raw: rawObj,
      }),
    );
  }

  if (parsed.length === 0) throw IMPORT_ERRORS.noMovements();
  return { rows: parsed, warnings };
}

/** Divide um CSV respeitando aspas e detectando o delimitador. */
export function parseCsv(content: string): ParseResult {
  const text = content.replace(/^\uFEFF/, "").trim();
  if (!text) throw IMPORT_ERRORS.emptyFile();

  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts: Record<string, number> = {
    ";": (sample.match(/;/g) ?? []).length,
    ",": (sample.match(/,/g) ?? []).length,
    "\t": (sample.match(/\t/g) ?? []).length,
  };
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as string;

  const rows: SheetRow[] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  row.push(field);
  rows.push(row);

  return parseSheetRows(rows.map((r) => r.map((c) => (typeof c === "string" ? c.trim() : c))));
}
