import {
  IMPORT_ERRORS,
  type ImportIntegrity,
  type IntegritySection,
  type ParseContext,
  type ParseResult,
  type ParsedRow,
} from "./types";
import { normalizeDescription, parseAmount, parseDate, withRowWarnings } from "./shared";

/**
 * Pipeline de PDF textual (sem OCR):
 *   extração com coordenadas → reconstrução de linhas/colunas → segmentação por seção
 *   → extração de TODAS as transações de cada linha → normalização
 *   → detecção de anomalias → validação matemática contra totais declarados.
 *
 * Causa raiz corrigida: a versão anterior aplicava UMA expressão ancorada (^…$) por linha
 * visual. Em layouts de duas colunas (ex.: Banco PAN), duas transações dividem a mesma
 * linha; a expressão "engolia" a primeira dentro da descrição da segunda.
 */

export const PAGE_MARKER = "\u000c--- pagina ";
export const COLUMN_GAP = "   "; // lacuna horizontal relevante entre blocos de texto

const DATE = String.raw`\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?`;
// Valor monetário: exige centavos (evita confundir "Parcela 07/10" ou números soltos).
const MONEY = String.raw`(?:-\s?)?\(?(?:R\$\s?)?(?:-\s?)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\)?|(?:-\s?)?(?:R\$\s?)?(?:-\s?)?\d+\.\d{2}(?!\d)`;
/** Uma transação: data, descrição (mínima), valor e sufixo C/D opcional. */
const TX_RE = new RegExp(
  String.raw`\s*(${DATE})\s+(.+?)\s+(${MONEY})(?:\s+([CD]))?(?=\s+${DATE}\s|\s*$)`,
  "iy",
);
const MONEY_ANY = new RegExp(MONEY, "i");
const DATE_ANY = new RegExp(String.raw`(?<![\w/])${DATE}(?![\w/])`, "g");

const SECTION_RE = /(cart[aã]o\s+(titular|adicional)?\s*final\s+(\d{4}))/i;
const SECTION_HEADER_RE = /lan[cç]amentos\s+do\s+cart[aã]o(\s+adicional)?/i;
const SECTION_TOTAL_RE = new RegExp(
  String.raw`total\s+de\s+compras\s+e\s+despesas[^:]*:?\s*(${MONEY})`,
  "i",
);
const INVOICE_TOTAL_INLINE_RE = new RegExp(String.raw`total\s+da\s+fatura\s+(${MONEY})(?:\s+([CD]))?`, "i");
const INVOICE_HEADER_RE = /^fatura\s+de\s+[a-zç]+/i;

const SUMMARY_WORDS =
  /^(saldo|total|subtotal|limite|pagamento minimo|minimo|cet|iof r|valor da fatura|despesas futuras|parcelas e transacoes)/;
const CREDIT_WORDS = /\b(pagamento|pgto|estorno|credito|devolucao|reembolso|cashback)\b/;
const PAYMENT_WORDS = /\b(pagamento|pgto)\b/;

type Section = { key: string; label: string; last4: string | null; role: string | null };

function money(text: string): { value: number | null; negative: boolean } {
  const p = parseAmount(text);
  return { value: p.value, negative: p.negative };
}

/** Anomalias estruturais: indícios de linhas concatenadas. */
export function detectDescriptionAnomalies(description: string): string[] {
  const out: string[] = [];
  if (MONEY_ANY.test(description)) out.push("Descrição contém valor monetário — possível linha concatenada");
  const dates = [...description.matchAll(DATE_ANY)].filter((m) => {
    const before = description.slice(0, m.index).toLowerCase();
    return !/(parcela|parc\.?|plano)\s*$/.test(before);
  });
  if (dates.length > 0) out.push("Descrição contém data — possível segunda transação na mesma linha");
  return out;
}

export function parsePdfText(
  text: string,
  fallbackYearOrContext?: number | ParseContext,
): ParseResult {
  if (!text.trim()) throw IMPORT_ERRORS.emptyFile();
  const ctx: ParseContext =
    typeof fallbackYearOrContext === "number"
      ? { fallbackYear: fallbackYearOrContext }
      : (fallbackYearOrContext ?? {});
  const isCard = ctx.sourceType === "cartao";
  const year = ctx.fallbackYear ?? new Date().getFullYear();

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const sections = new Map<string, IntegritySection>();
  let section: Section = { key: "geral", label: "Lançamentos", last4: null, role: null };
  let page = 1;
  let declaredInvoice: number | null = null;
  let expectInvoiceValue = false;
  let pendingHeader: string | null = null;
  const anomalies: string[] = [];

  const ensureSection = (s: Section) => {
    if (!sections.has(s.key)) {
      sections.set(s.key, {
        key: s.key,
        label: s.label,
        card_last4: s.last4,
        card_role: s.role,
        count: 0,
        purchases_total: 0,
        credits_total: 0,
        payments_total: 0,
        declared_total: null,
        difference: null,
      });
    }
    return sections.get(s.key)!;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.startsWith(PAGE_MARKER)) {
      page = Number(rawLine.slice(PAGE_MARKER.length)) || page;
      continue;
    }
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const norm = normalizeDescription(line);

    // Total da fatura declarado ("Fatura de setembro" + valor na linha seguinte, ou inline)
    if (INVOICE_HEADER_RE.test(line)) {
      const m = MONEY_ANY.exec(line.replace(INVOICE_HEADER_RE, ""));
      if (m) declaredInvoice = money(m[0]).value;
      else expectInvoiceValue = true;
      continue;
    }
    if (expectInvoiceValue) {
      expectInvoiceValue = false;
      const m = MONEY_ANY.exec(line);
      if (m && declaredInvoice === null) declaredInvoice = money(m[0]).value;
    }
    const inlineTotal = INVOICE_TOTAL_INLINE_RE.exec(line);
    if (inlineTotal && declaredInvoice === null) declaredInvoice = money(inlineTotal[1]!).value;

    // Seções (cartão titular / adicional)
    const header = SECTION_HEADER_RE.exec(line);
    const sec = SECTION_RE.exec(line);
    if (header || (sec && pendingHeader !== null)) {
      const role = header?.[1] ? "adicional" : sec?.[2]?.toLowerCase() ?? (header ? "titular" : null);
      const last4 = sec?.[3] ?? null;
      if (last4) {
        section = {
          key: `cartao-${last4}`,
          label: `Cartão ${role ?? ""} final ${last4}`.replace(/\s+/g, " "),
          last4,
          role,
        };
        ensureSection(section);
        pendingHeader = null;
      } else {
        pendingHeader = role;
      }
    }
    const secTotal = SECTION_TOTAL_RE.exec(line);
    if (secTotal) {
      ensureSection(section).declared_total = money(secTotal[1]!).value;
      continue;
    }

    // Extrai TODAS as transações da linha (colunas paralelas)
    TX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let consumed = 0;
    const found: RegExpExecArray[] = [];
    while ((m = TX_RE.exec(line)) !== null) {
      found.push(m);
      consumed = TX_RE.lastIndex;
      if (consumed >= line.length) break;
    }
    if (found.length === 0) continue;
    if (line.slice(consumed).trim()) {
      anomalies.push(`Página ${page}: trecho não interpretado após transações: "${line.slice(consumed).trim()}"`);
    }

    for (const tx of found) {
      let dateText = tx[1]!;
      if (/^\d{1,2}[/.-]\d{1,2}$/.test(dateText)) dateText = `${dateText}/${year}`;
      const description = tx[2]!.replace(/\s+/g, " ").trim();
      const descNorm = normalizeDescription(description);
      if (SUMMARY_WORDS.test(descNorm)) continue;

      const suffix = (tx[4] ?? "").toUpperCase();
      const parsed = parseAmount(suffix ? `${tx[3]} ${suffix}` : tx[3]!);
      const isPayment = PAYMENT_WORDS.test(descNorm);

      let direction: ParsedRow["direction"] = null;
      let kind: "compra_despesa" | "encargo" | "pagamento" | "credito" | "indeterminado" =
        "indeterminado";
      if (parsed.value !== null) {
        if (isCard) {
          // Fatura: positivo = compra/encargo (saída); negativo/C = pagamento ou crédito.
          const credit = parsed.negative || suffix === "C";
          direction = credit ? "entrada" : "saida";
          if (credit) kind = isPayment ? "pagamento" : "credito";
          else kind = /\b(juros|multa|iof|encargo|tarifa|anuidade|mora)\b/.test(descNorm) ? "encargo" : "compra_despesa";
          if (!credit && CREDIT_WORDS.test(descNorm) && !isPayment) kind = "indeterminado";
        } else {
          direction = parsed.negative ? "saida" : "entrada";
          if (suffix === "D") direction = "saida";
          if (suffix === "C") direction = "entrada";
        }
      }

      const rowWarnings: string[] = [];
      if (parsed.ambiguous) rowWarnings.push("Valor ambíguo — confira antes de confirmar");
      const anomaly = detectDescriptionAnomalies(description);
      rowWarnings.push(...anomaly);
      if (anomaly.length) anomalies.push(`Página ${page}: ${description}`);
      if (isCard && kind === "pagamento") rowWarnings.push("Pagamento de fatura — não compõe compras/despesas");

      const s = ensureSection(section);
      s.count += 1;
      if (parsed.value !== null) {
        if (kind === "pagamento") s.payments_total += parsed.value;
        else if (direction === "entrada" && isCard) s.credits_total += parsed.value;
        else if (direction === "saida" && isCard) s.purchases_total += parsed.value;
      }

      rows.push(
        withRowWarnings({
          posted_at: parseDate(dateText),
          description,
          amount: parsed.value,
          direction,
          currency: "BRL",
          warnings: rowWarnings,
          raw: {
            line,
            date_text: tx[1],
            amount_text: tx[3],
            signed_amount: parsed.value === null ? null : parsed.negative ? -parsed.value : parsed.value,
            nature: isCard ? kind : direction ?? "indeterminado",
            section: section.label,
            card_last4: section.last4,
            card_role: section.role,
            page,
          },
        }),
      );
    }
  }

  if (rows.length === 0) throw IMPORT_ERRORS.noMovements();

  const integrity = buildIntegrity({
    parser: "pdf-textual-v2",
    layout: sections.size > 1 || [...sections.values()].some((s) => s.card_last4) ? "fatura-cartao-secoes" : "pdf-tabular-generico",
    rows,
    sections: [...sections.values()],
    declaredInvoice,
    anomalies,
    isCard,
  });
  return { rows, warnings, integrity };
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function buildIntegrity(input: {
  parser: string;
  layout: string;
  rows: ParsedRow[];
  sections: IntegritySection[];
  declaredInvoice: number | null;
  anomalies: string[];
  isCard: boolean;
}): ImportIntegrity {
  const sections = input.sections
    .filter((s) => s.count > 0 || s.declared_total !== null)
    .map((s) => {
      const net = cents(s.purchases_total - s.credits_total);
      return {
        ...s,
        purchases_total: cents(s.purchases_total),
        credits_total: cents(s.credits_total),
        payments_total: cents(s.payments_total),
        difference: s.declared_total === null ? null : cents(s.declared_total - net),
      };
    });
  const extracted = cents(sections.reduce((a, s) => a + s.purchases_total - s.credits_total, 0));
  const declared = input.declaredInvoice;
  const sectionDivergent = sections.some((s) => s.difference !== null && Math.abs(s.difference) >= 0.01);
  const invoiceDiff = declared === null || !input.isCard ? null : cents(declared - extracted);
  const invoiceDivergent = invoiceDiff !== null && Math.abs(invoiceDiff) >= 0.01;
  const hasDeclared = declared !== null || sections.some((s) => s.declared_total !== null);
  const incomplete = input.rows.some((r) => r.warnings.length > 0 && (r.amount === null || !r.posted_at || !r.direction));

  let status: ImportIntegrity["status"] = "validada";
  const messages: string[] = [];
  if (sectionDivergent || invoiceDivergent) {
    status = "divergente";
    messages.push("Totais extraídos não conciliam com os totais declarados no documento.");
  } else if (input.anomalies.length > 0 || incomplete || !hasDeclared) {
    status = "revisao";
    if (!hasDeclared) messages.push("O documento não declara totais para conferência automática.");
    if (input.anomalies.length) messages.push("Foram detectadas anomalias estruturais.");
    if (incomplete) messages.push("Há itens com campos ausentes ou ambíguos.");
  } else {
    messages.push("Estrutura reconhecida e totais conciliados.");
  }

  return {
    status,
    parser: input.parser,
    layout: input.layout,
    row_count: input.rows.length,
    extracted_total: input.isCard ? extracted : null,
    declared_total: input.isCard ? declared : null,
    difference: invoiceDiff,
    sections,
    anomalies: input.anomalies,
    messages,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * Extrai o texto de um PDF preservando a estrutura espacial (camada de texto; sem OCR).
 * Linhas são reconstruídas pela coordenada Y (com tolerância) e ordenadas por X;
 * lacunas horizontais grandes viram separadores de coluna; páginas recebem marcador.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as Array<{ str?: string; transform?: number[]; width?: number }>)
      .filter((i) => typeof i.str === "string" && i.str.trim() && i.transform)
      .map((i) => ({
        x: i.transform![4] ?? 0,
        y: i.transform![5] ?? 0,
        w: i.width ?? 0,
        h: Math.abs(i.transform![3] ?? 10) || 10,
        str: i.str!,
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    pages.push(groupItemsIntoLines(items).join("\n"));
    void p;
  }
  const text = pages.map((t, i) => `${PAGE_MARKER}${i + 1}\n${t}`).join("\n");
  if (!pages.join("").trim()) throw IMPORT_ERRORS.unreadable("o PDF não possui camada de texto (imagem)");
  return text;
}

export type PositionedItem = { x: number; y: number; w: number; h: number; str: string };

/** Agrupa itens posicionados em linhas visuais (exportado para testes). */
export function groupItemsIntoLines(items: PositionedItem[]): string[] {
  const lines: { y: number; parts: PositionedItem[] }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const tol = Math.max(2, it.h * 0.45);
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) line.parts.push(it);
    else lines.push({ y: it.y, parts: [it] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const parts = l.parts.sort((a, b) => a.x - b.x);
      let out = "";
      let end = -Infinity;
      for (const part of parts) {
        const gap = part.x - end;
        if (out) out += gap > part.h * 2 ? COLUMN_GAP : " ";
        out += part.str;
        end = part.x + part.w;
      }
      return out;
    });
}
