import { normalizeDescription } from "./shared";
import { matchSystemRule, isSemanticallyLocked } from "./classify";

/**
 * Memória de classificação (sem IA): regras determinísticas por empresa.
 * Prioridade: 1) semântica obrigatória → 2) regra manual → 3) memória exata
 * → 4) sugestão por similaridade (não aplica) → 5) Não classificado.
 */

export type ClassificationSource = "manual" | "regra_aprendida" | "regra_parser" | "nao_classificado";

export type RuleLike = {
  id: string;
  company_id: string;
  pattern: string;
  match_type: "exata" | "contem";
  category_id: string;
  subcategory_id: string | null;
  origin: "aprendida" | "manual";
  rejected_count: number;
  status: "ativo" | "inativo";
};
export type CategoryLike = { id: string; name: string; status?: string };
export type SubcategoryLike = { id: string; name: string; category_id: string; status?: string };

export type Suggestion = {
  reason: "ambigua" | "similaridade" | "regra_inativa" | "regra_rejeitada";
  options: Array<{ category_id: string; subcategory_id: string | null; rule_id: string }>;
};

export type ClassificationResult = {
  category_id: string | null;
  subcategory_id: string | null;
  source: ClassificationSource;
  rule_id: string | null;
  /** Identificador da regra determinística do sistema (somente quando source = regra_parser). */
  system_rule: string | null;
  suggestion: Suggestion | null;
};

const INSTALLMENT_RE = /\b(parcela|parc|prc)\s*\d{1,2}\s*(de)?\s*\d{1,2}\b/g;
const DATE_RE = /\b\d{1,2}\s\d{1,2}(\s\d{2,4})?\b/g;
const NUMBER_TOKEN_RE = /\b[a-z]*\d[a-z0-9]*\b/g;

/**
 * Parte estável da descrição: remove parcelas, datas, NSU/códigos/valores
 * (qualquer token contendo dígitos) e normaliza caixa, acentos e espaços.
 */
export function stablePattern(description: string): string {
  return normalizeDescription(description)
    .replace(INSTALLMENT_RE, " ")
    .replace(DATE_RE, " ")
    .replace(NUMBER_TOKEN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Contém o padrão como palavras inteiras (evita "pier" casar com "pierre"). */
function containsWords(text: string, pattern: string): boolean {
  if (!pattern) return false;
  return ` ${text} `.includes(` ${pattern} `);
}

const key = (r: { category_id: string; subcategory_id: string | null }) => `${r.category_id}|${r.subcategory_id ?? ""}`;

function isRuleTargetValid(r: RuleLike, cats: CategoryLike[], subs: SubcategoryLike[]): boolean {
  const cat = cats.find((c) => c.id === r.category_id);
  if (!cat || (cat.status && cat.status !== "ativo")) return false;
  if (!r.subcategory_id) return true;
  const sub = subs.find((s) => s.id === r.subcategory_id);
  return !!sub && sub.category_id === r.category_id && (!sub.status || sub.status === "ativo");
}

export function classify(input: {
  companyId: string;
  description: string;
  rules: RuleLike[];
  categories: CategoryLike[];
  subcategories: SubcategoryLike[];
}): ClassificationResult {
  const none: ClassificationResult = { category_id: null, subcategory_id: null, source: "nao_classificado", rule_id: null, system_rule: null, suggestion: null };
  const { description, categories, subcategories } = input;
  const norm = normalizeDescription(description);
  if (!norm) return none;

  const byName = (name: string) => {
    const t = normalizeDescription(name);
    return categories.find((c) => normalizeDescription(c.name) === t && (!c.status || c.status === "ativo"))?.id ?? null;
  };

  // 1) Semântica obrigatória: pagamento/estorno/crédito/juros/taxa inequívocos.
  const sys = matchSystemRule(description);
  if (isSemanticallyLocked(description)) {
    const id = sys ? byName(sys.category) : null;
    return id && sys ? { ...none, category_id: id, source: "regra_parser", system_rule: sys.ruleId } : none;
  }

  const stable = stablePattern(description);
  // Isolamento por empresa (além do RLS): só regras da própria empresa.
  const all = input.rules.filter((r) => r.company_id === input.companyId);
  const active = all.filter((r) => r.status === "ativo");
  const matches = (r: RuleLike) =>
    r.match_type === "exata" ? r.pattern === stable : containsWords(stable, r.pattern);

  // 2) Regras manuais explícitas; 3) memória aprendida exata.
  for (const origin of ["manual", "aprendida"] as const) {
    const cands = active.filter((r) => r.origin === origin && matches(r));
    if (cands.length === 0) continue;
    const valid = cands.filter((r) => isRuleTargetValid(r, categories, subcategories));
    const opts = cands.map((r) => ({ category_id: r.category_id, subcategory_id: r.subcategory_id, rule_id: r.id }));
    const distinct = new Set(cands.map(key));
    if (distinct.size > 1) return { ...none, suggestion: { reason: "ambigua", options: opts } };
    if (valid.length === 0) return { ...none, suggestion: { reason: "regra_inativa", options: opts } };
    const rule = valid[0]!;
    if (rule.rejected_count > 0) return { ...none, suggestion: { reason: "regra_rejeitada", options: opts } };
    return { category_id: rule.category_id, subcategory_id: rule.subcategory_id, source: "regra_aprendida", rule_id: rule.id, system_rule: null, suggestion: null };
  }

  // 4) Similaridade (somente sugestão): padrão aprendido contido na descrição ou vice-versa.
  if (stable.length >= 5) {
    const similar = active.filter(
      (r) => r.pattern.length >= 5 && (containsWords(stable, r.pattern) || containsWords(r.pattern, stable)),
    );
    const validSimilar = similar.filter((r) => isRuleTargetValid(r, categories, subcategories));
    if (validSimilar.length > 0) {
      const distinct = new Set(validSimilar.map(key));
      return {
        ...none,
        suggestion: {
          reason: distinct.size > 1 ? "ambigua" : "similaridade",
          options: validSimilar.map((r) => ({ category_id: r.category_id, subcategory_id: r.subcategory_id, rule_id: r.id })),
        },
      };
    }
  }

  // Regra fraca do parser (ex.: "Compra") só quando não há memória.
  if (sys) {
    const id = byName(sys.category);
    if (id) return { ...none, category_id: id, source: "regra_parser", system_rule: sys.ruleId };
  }
  return none;
}

/** Descrições que nunca devem alimentar a memória (semântica obrigatória). */
export function isLearnable(description: string): boolean {
  return !isSemanticallyLocked(description) && stablePattern(description).length >= 3;
}
