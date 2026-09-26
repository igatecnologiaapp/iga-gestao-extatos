import type { Direction, ParsedRow } from "./types";

/** Normaliza descrição para comparação de duplicidade (sem acentos, espaços e ruído). */
export function normalizeDescription(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Converte texto monetário em número.
 * Retorna `null` quando houver ambiguidade (nunca converte silenciosamente).
 */
export function parseAmount(input: string | number | null | undefined): {
  value: number | null;
  negative: boolean;
  ambiguous: boolean;
} {
  if (input === null || input === undefined || input === "") {
    return { value: null, negative: false, ambiguous: false };
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { value: null, negative: false, ambiguous: true };
    return { value: Math.abs(input), negative: input < 0, ambiguous: false };
  }

  let text = input.trim();
  if (!text) return { value: null, negative: false, ambiguous: false };

  let negative = /^\(.*\)$/.test(text) || /-/.test(text) || /\bD\b$/i.test(text.trim());
  if (/\bC\b$/i.test(text.trim())) negative = false;

  text = text
    .replace(/[()]/g, "")
    .replace(/\b[CD]\b\s*$/i, "")
    .replace(/(R\$|BRL|USD|EUR|\$)/gi, "")
    .replace(/\s/g, "")
    .replace(/[+-]/g, "");

  if (!text) return { value: null, negative, ambiguous: false };

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let normalized = text;

  if (hasComma && hasDot) {
    // O último separador é o decimal.
    normalized =
      text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (hasComma) {
    const parts = text.split(",");
    // "1,234" pode ser milhar (en) ou decimal (pt-BR) → ambíguo.
    if (parts.length === 2 && parts[1]!.length === 3 && parts[0]!.length <= 3) {
      return { value: null, negative, ambiguous: true };
    }
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    const parts = text.split(".");
    if (parts.length > 2) normalized = text.replace(/\./g, "");
    else if (parts[1]!.length === 3) return { value: null, negative, ambiguous: true };
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return { value: null, negative, ambiguous: true };
  return { value: Math.round(Math.abs(n) * 100) / 100, negative, ambiguous: false };
}

/**
 * Valida se uma data ISO (yyyy-mm-dd) existe no calendário e está em faixa plausível.
 * Datas como 0000-00-00, 00/00/0000, 31/02/2026 ou fora de 1900–2100 são inválidas.
 */
export function isValidIsoDate(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function parseIsoUnsafe(input: string | number | Date | null | undefined): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) return toIso(input);
  if (typeof input === "number") {
    // Serial de planilha (base 1899-12-30).
    const ms = Math.round((input - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : toIso(d);
  }
  const text = String(input).trim();
  if (!text) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(text);
  if (m) {
    const day = m[1]!.padStart(2, "0");
    const month = m[2]!.padStart(2, "0");
    let year = m[3]!;
    if (year.length === 2) year = Number(year) > 60 ? `19${year}` : `20${year}`;
    return `${year}-${month}-${day}`;
  }
  m = /^(\d{4})(\d{2})(\d{2})/.exec(text); // OFX: 20240131...
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/**
 * Converte data em ISO (yyyy-mm-dd). Aceita dd/mm/aaaa, aaaa-mm-dd, dd-mm-aa, OFX e Date.
 * Datas inválidas/impossíveis (0000-00-00, 00/00/0000, 31/02/2026, texto não reconhecido)
 * retornam null — nunca uma data fictícia; o item segue para a Revisão como pendência.
 */
export function parseDate(input: string | number | Date | null | undefined): string | null {
  const iso = parseIsoUnsafe(input);
  return isValidIsoDate(iso) ? iso : null;
}

function toIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Impressão digital de um lançamento, usada na prevenção de duplicidade nível 2. */
export function fingerprintOf(input: {
  companyId: string;
  accountId?: string | null;
  cardId?: string | null;
  postedAt: string | null;
  amount: number | null;
  direction: Direction | null;
  description: string;
}): string {
  return [
    input.companyId,
    input.accountId ?? input.cardId ?? "-",
    input.postedAt ?? "-",
    input.amount === null ? "-" : input.amount.toFixed(2),
    input.direction ?? "-",
    normalizeDescription(input.description),
  ].join("|");
}

/** Adiciona avisos de inconsistência padronizados a uma linha extraída. */
export function withRowWarnings(row: ParsedRow): ParsedRow {
  const warnings = [...row.warnings];
  if (!row.posted_at) warnings.push("Data não identificada");
  if (row.amount === null) warnings.push("Valor não identificado ou ambíguo");
  if (!row.direction) warnings.push("Natureza (entrada/saída) não identificada");
  if (!row.description.trim()) warnings.push("Descrição vazia");
  return { ...row, warnings };
}
