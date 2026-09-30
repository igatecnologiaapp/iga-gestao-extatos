import { normalizeDescription } from "./shared";

/** Categorias mínimas garantidas pela Fase 2 (não limitam o cadastro do usuário). */
export const BASE_IMPORT_CATEGORIES = ["Compra", "Taxa", "Juros"] as const;
export const UNCLASSIFIED_LABEL = "Não classificado";

/**
 * Pagamentos de fatura e créditos/estornos NUNCA recebem "Compra".
 * Pagamento → categoria "Pagamento" somente se já existir no cadastro; caso contrário, Não classificado.
 * Estorno/crédito → Não classificado (revisão humana). A natureza é decidida pelo parser, não aqui.
 */
const PAYMENT_PATTERNS = [
  /\bpagamento (efetuado|recebido|de fatura|da fatura|fatura)\b/,
  /\bpgto (efetuado|recebido|fatura)\b/,
  /\bpagto (efetuado|recebido|fatura)\b/,
];
const CREDIT_PATTERNS = [/\bestorno\b/, /\bcredito\b/, /\bdevolucao\b/, /\breembolso\b/, /\bcashback\b/];
export const PAYMENT_CATEGORY = "Pagamento";
const NO_CATEGORY = "__none__";

const RULES: Array<{ category: string; patterns: RegExp[] }> = [
  { category: PAYMENT_CATEGORY, patterns: PAYMENT_PATTERNS },
  { category: NO_CATEGORY, patterns: CREDIT_PATTERNS },
  {
    category: "Juros",
    patterns: [/\bjuros?\b/, /\brotativo\b/, /\bmora\b/, /\bencargos?\b/, /\bmulta\b/],
  },
  {
    category: "Taxa",
    patterns: [
      /\btarifa\b/,
      /\btaxa\b/,
      /\banuidade\b/,
      /\bmanutencao de conta\b/,
      /\bcesta\b/,
      /\biof\b/,
    ],
  },
  {
    category: "Compra",
    patterns: [
      /\bcompra\b/,
      /\bmercado\b/,
      /\bposto\b/,
      /\bsupermercado\b/,
      /\brestaurante\b/,
      /\bfarmacia\b/,
    ],
  },
];

/**
 * Sugere uma categoria com base na descrição (conservador).
 * Retorna `null` quando não há classificação segura → "Não classificado".
 */
export function suggestCategoryName(description: string): string | null {
  const text = normalizeDescription(description);
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.category === NO_CATEGORY ? null : rule.category;
    }
  }
  return null;
}

/** Resolve o id da categoria cadastrada correspondente à sugestão (case-insensitive). */
export function resolveCategoryId(
  description: string,
  categories: Array<{ id: string; name: string }>,
): string | null {
  const suggestion = suggestCategoryName(description);
  if (!suggestion) return null;
  const target = normalizeDescription(suggestion);
  const found = categories.find((c) => normalizeDescription(c.name) === target);
  return found?.id ?? null;
}
