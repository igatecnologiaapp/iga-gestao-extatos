import { IMPORT_ERRORS, type ParseResult, type ParsedRow } from "./types";
import { normalizeDescription, parseAmount, parseDate, withRowWarnings } from "./shared";

const LINE_RE =
  /^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s+(.+?)\s+(-?\(?R?\$?\s?[\d.,]+\)?)\s*([CD])?$/i;

/**
 * Interpreta o texto já extraído de um PDF de extrato/fatura.
 * Não faz OCR: depende de PDFs com camada de texto.
 */
export function parsePdfText(text: string, fallbackYear?: number): ParseResult {
  if (!text.trim()) throw IMPORT_ERRORS.emptyFile();
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const year = fallbackYear ?? new Date().getFullYear();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;

    let dateText = m[1]!;
    if (/^\d{1,2}[/.-]\d{1,2}$/.test(dateText)) dateText = `${dateText}/${year}`;
    const description = m[2]!.trim();
    if (/^(saldo|total|subtotal)\b/.test(normalizeDescription(description))) continue;

    const suffix = (m[4] ?? "").toUpperCase();
    const amountText = suffix ? `${m[3]} ${suffix}` : m[3]!;
    const parsed = parseAmount(amountText);

    let direction: ParsedRow["direction"] = null;
    if (parsed.value !== null) direction = parsed.negative ? "saida" : "entrada";
    if (suffix === "D") direction = "saida";
    if (suffix === "C") direction = "entrada";

    rows.push(
      withRowWarnings({
        posted_at: parseDate(dateText),
        description,
        amount: parsed.value,
        direction,
        currency: "BRL",
        warnings: parsed.ambiguous ? ["Valor ambíguo — confira antes de confirmar"] : [],
        raw: { line },
      }),
    );
  }

  if (rows.length === 0) throw IMPORT_ERRORS.noMovements();
  return { rows, warnings };
}

/** Extrai o texto de um PDF no navegador (camada de texto; sem OCR). */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Reagrupa itens por linha usando a coordenada vertical.
    const lines = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!("str" in item)) continue;
      const y = Math.round((item.transform[5] ?? 0) / 2);
      const arr = lines.get(y) ?? [];
      arr.push({ x: item.transform[4] ?? 0, str: item.str });
      lines.set(y, arr);
    }
    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.str)
          .join(" "),
      );
    pages.push(ordered.join("\n"));
  }
  const text = pages.join("\n");
  if (!text.trim()) throw IMPORT_ERRORS.unreadable("o PDF não possui camada de texto (imagem)");
  return text;
}
