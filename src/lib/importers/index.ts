import { IMPORT_ERRORS, type ImportFileFormat, type ParseResult } from "./types";
import { parseCsv, parseSheetRows, type SheetRow } from "./tabular";
import { parseOfx } from "./ofx";
import { parsePdfText, extractPdfText } from "./pdf";

export * from "./types";
export * from "./shared";
export * from "./classify";
export { parseCsv, parseSheetRows } from "./tabular";
export { parseOfx } from "./ofx";
export { parsePdfText, extractPdfText } from "./pdf";

export const ACCEPTED_EXTENSIONS = [".pdf", ".ofx", ".csv", ".xls", ".xlsx"];

/** Detecta o formato pelo nome do arquivo. Lança erro claro em formato não suportado. */
export function detectFormat(fileName: string): ImportFileFormat {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "ofx":
    case "qfx":
      return "ofx";
    case "csv":
    case "txt":
      return "csv";
    case "xls":
    case "xlsx":
      return "xlsx";
    default:
      throw IMPORT_ERRORS.unsupported(ext);
  }
}

/** Hash SHA-256 do arquivo — prevenção de duplicidade nível 1. */
export async function hashFile(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw IMPORT_ERRORS.emptyFile();
  const sheet = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  return parseSheetRows(rows);
}

/** Ponto único de entrada: recebe o conteúdo do arquivo e devolve as linhas extraídas. */
export async function parseDocument(
  format: ImportFileFormat,
  buffer: ArrayBuffer,
): Promise<ParseResult> {
  if (buffer.byteLength === 0) throw IMPORT_ERRORS.emptyFile();
  switch (format) {
    case "csv":
      return parseCsv(new TextDecoder("utf-8").decode(buffer));
    case "ofx":
      return parseOfx(new TextDecoder("utf-8").decode(buffer));
    case "xlsx":
      return parseXlsxBuffer(buffer);
    case "pdf":
      return parsePdfText(await extractPdfText(buffer));
    default:
      throw IMPORT_ERRORS.unsupported(String(format));
  }
}
