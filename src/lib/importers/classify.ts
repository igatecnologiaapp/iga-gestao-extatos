import { normalizeDescription } from "./shared";

/** Categorias mínimas garantidas pela Fase 2 (não limitam o cadastro do usuário). */
export const BASE_IMPORT_CATEGORIES = ["Compra", "Taxa", "Juros"] as const;
export const UNCLASSIFIED_LABEL = "Não classificado";

const RULES: Array<{ category: string; patterns: RegExp[] }> = [
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
      /\bpagamento\b/,
      /\bdebito automatico\b/,
      /\bcartao\b/,
      /\bmercado\b/,
      /\bposto\b/,
      /\bsupermercado\b/,
      /\brestaurante\b/,
      /\bfarmacia\b/,
    ],
  },
];

/**
 * Sugere uma categoria com base na descrição.
 * Retorna `null` quando não há classificação segura → "Não classificado".
 */
export function suggestCategoryName(description: string): string | null {
  const text = normalizeDescription(description);
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.category;
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
