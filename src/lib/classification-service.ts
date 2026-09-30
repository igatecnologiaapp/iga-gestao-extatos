import { supabase } from "@/lib/backend-client";
import {
  classify,
  isLearnable,
  stablePattern,
  type CategoryLike,
  type ClassificationResult,
  type RuleLike,
  type SubcategoryLike,
} from "@/lib/importers/classification-memory";

export type ClassificationContext = {
  companyId: string;
  rules: RuleLike[];
  categories: CategoryLike[];
  subcategories: SubcategoryLike[];
};

/** Carrega regras, categorias e subcategorias da empresa (RLS aplicado). */
export async function loadClassificationContext(companyId: string): Promise<ClassificationContext> {
  const [rules, cats, subs] = await Promise.all([
    supabase
      .from("classification_rules")
      .select("id, company_id, pattern, match_type, category_id, subcategory_id, origin, rejected_count, status")
      .eq("company_id", companyId),
    supabase.from("transaction_categories").select("id, name, status").eq("company_id", companyId),
    supabase.from("transaction_subcategories").select("id, name, category_id, status").eq("company_id", companyId),
  ]);
  return {
    companyId,
    rules: (rules.data ?? []) as RuleLike[],
    categories: (cats.data ?? []) as CategoryLike[],
    subcategories: (subs.data ?? []) as SubcategoryLike[],
  };
}

export function classifyWith(ctx: ClassificationContext, description: string): ClassificationResult {
  return classify({ ...ctx, description });
}

/** Contabiliza uso das regras aplicadas (não altera lançamentos históricos). */
export async function bumpRuleUsage(ruleIds: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const id of ruleIds) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    const { data } = await supabase.from("classification_rules").select("usage_count").eq("id", id).maybeSingle();
    if (!data) continue;
    await supabase
      .from("classification_rules")
      .update({ usage_count: data.usage_count + n, last_used_at: new Date().toISOString() })
      .eq("id", id);
  }
}

/**
 * Aprende com a classificação manual do usuário.
 * - Se a classificação anterior veio de uma regra e foi alterada, a regra recebe
 *   uma rejeição (deixa de ser aplicada automaticamente — vira apenas sugestão).
 * - Registra a nova decisão como regra da empresa (nunca apaga histórico).
 * - Não altera lançamentos já existentes (sem reclassificação retroativa).
 */
export async function learnClassification(params: {
  companyId: string;
  description: string;
  categoryId: string | null;
  subcategoryId: string | null;
  previousRuleId: string | null;
  previousCategoryId: string | null;
  previousSubcategoryId: string | null;
  userId: string | null;
}): Promise<{ learned: boolean; rejectedRule: boolean }> {
  const changed =
    params.categoryId !== params.previousCategoryId || (params.subcategoryId ?? null) !== (params.previousSubcategoryId ?? null);
  let rejectedRule = false;
  if (changed && params.previousRuleId) {
    const { data } = await supabase
      .from("classification_rules")
      .select("rejected_count")
      .eq("id", params.previousRuleId)
      .maybeSingle();
    if (data) {
      await supabase
        .from("classification_rules")
        .update({ rejected_count: data.rejected_count + 1 })
        .eq("id", params.previousRuleId);
      rejectedRule = true;
    }
  }
  if (!changed || !params.categoryId || !isLearnable(params.description)) return { learned: false, rejectedRule };

  const pattern = stablePattern(params.description);
  let q = supabase
    .from("classification_rules")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("pattern", pattern)
    .eq("match_type", "exata")
    .eq("category_id", params.categoryId);
  q = params.subcategoryId ? q.eq("subcategory_id", params.subcategoryId) : q.is("subcategory_id", null);
  const { data: existing } = await q.maybeSingle();
  if (existing) return { learned: false, rejectedRule };

  const { error } = await supabase.from("classification_rules").insert({
    company_id: params.companyId,
    pattern,
    match_type: "exata",
    category_id: params.categoryId,
    subcategory_id: params.subcategoryId,
    origin: "aprendida",
    sample_description: params.description.slice(0, 200),
    created_by: params.userId,
  });
  if (error && error.code !== "23505") throw error;
  return { learned: !error, rejectedRule };
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  regra_aprendida: "Regra aprendida",
  regra_parser: "Regra do sistema",
  nao_classificado: "Não classificado",
};
