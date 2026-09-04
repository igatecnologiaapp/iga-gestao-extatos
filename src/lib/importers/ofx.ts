import { IMPORT_ERRORS, type ParseResult, type ParsedRow } from "./types";
import { parseAmount, parseDate, withRowWarnings } from "./shared";

function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}>([^<\\r\\n]*)`, "i");
  const m = re.exec(block);
  return m ? m[1]!.trim() : null;
}

/** Lê arquivos OFX (SGML ou XML) extraindo os blocos STMTTRN. */
export function parseOfx(content: string): ParseResult {
  const text = content.replace(/^\uFEFF/, "");
  if (!text.trim()) throw IMPORT_ERRORS.emptyFile();
  if (!/<OFX>/i.test(text) && !/<STMTTRN>/i.test(text)) {
    throw IMPORT_ERRORS.unreadable("o arquivo não parece ser um OFX válido");
  }

  const currency = tag(text, "CURDEF") ?? "BRL";
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];

  for (const block of blocks) {
    const body = block.split(/<\/STMTTRN>/i)[0] ?? block;
    const rawAmount = tag(body, "TRNAMT");
    const parsedAmount = parseAmount(rawAmount);
    const trnType = (tag(body, "TRNTYPE") ?? "").toUpperCase();

    let direction: ParsedRow["direction"] = null;
    if (parsedAmount.value !== null) direction = parsedAmount.negative ? "saida" : "entrada";
    if (trnType === "DEBIT") direction = "saida";
    if (trnType === "CREDIT") direction = "entrada";

    const memo = tag(body, "MEMO");
    const name = tag(body, "NAME");
    const description = [name, memo].filter(Boolean).join(" — ") || "";

    rows.push(
      withRowWarnings({
        posted_at: parseDate(tag(body, "DTPOSTED")),
        description,
        amount: parsedAmount.value,
        direction,
        currency,
        warnings: parsedAmount.ambiguous ? ["Valor ambíguo — confira antes de confirmar"] : [],
        raw: {
          fitid: tag(body, "FITID"),
          trntype: trnType,
          trnamt: rawAmount,
          memo,
          name,
        },
      }),
    );
  }

  if (rows.length === 0) throw IMPORT_ERRORS.noMovements();
  return { rows, warnings };
}
