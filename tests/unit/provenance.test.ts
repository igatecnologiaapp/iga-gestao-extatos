import { describe, expect, it } from "vitest";
import { classify } from "@/lib/importers/classification-memory";
import { matchSystemRule } from "@/lib/importers/classify";
import { provenanceLabel } from "@/lib/classification-service";

const cats = [
  { id: "j", name: "Juros", status: "ativo" },
  { id: "p", name: "Pagamento", status: "ativo" },
  { id: "s", name: "Seguros", status: "ativo" },
];
const base = { companyId: "A", categories: cats, subcategories: [] };
const rule = { id: "r1", company_id: "A", pattern: "pier seguradora", match_type: "exata" as const, category_id: "s", subcategory_id: null, origin: "aprendida" as const, rejected_count: 0, status: "ativo" as const };

describe("proveniência com evidência", () => {
  it("regra do sistema só com identificador real", () => {
    const r = classify({ ...base, description: "Juros De Mora", rules: [] });
    expect(r.source).toBe("regra_parser");
    expect(r.system_rule).toBe(matchSystemRule("Juros De Mora")!.ruleId);
    expect(r.system_rule).toMatch(/^juros:/);
  });
  it("regra aprendida referencia a regra usada", () => {
    const r = classify({ ...base, description: "PIER SEGURADORA", rules: [rule] });
    expect(r).toMatchObject({ source: "regra_aprendida", rule_id: "r1", system_rule: null });
  });
  it("sem regra → Não classificado, sem inventar Regra do sistema", () => {
    for (const d of ["Pier Seguradora", "Dl *google Serasa Cons", "Pg *getninjas Parcela 07/10"]) {
      const r = classify({ ...base, description: d, rules: [] });
      expect(r).toMatchObject({ source: "nao_classificado", category_id: null, system_rule: null, rule_id: null });
    }
  });
  it("regra de outra empresa não é usada", () => {
    const r = classify({ ...base, description: "PIER SEGURADORA", rules: [{ ...rule, company_id: "B" }] });
    expect(r.source).toBe("nao_classificado");
  });
  it("PAN: compras nunca viram Pagamento", () => {
    for (const d of ["Pier Seguradora", "Dl *google Serasa Cons", "Pg *getninjas Parcela 07/10"])
      expect(classify({ ...base, description: d, rules: [] }).category_id).not.toBe("p");
  });
  it("rótulo exige evidência", () => {
    const c = { category_id: "x", classification_rule_id: null, classification_system_rule: null, classified_by: null };
    expect(provenanceLabel({ ...c, classification_source: "regra_parser" })).toBe("Origem histórica indeterminada");
    expect(provenanceLabel({ ...c, classification_source: "regra_parser", classification_system_rule: "juros:x" })).toBe("Regra do sistema");
    expect(provenanceLabel({ ...c, classification_source: "regra_aprendida" })).toBe("Origem histórica indeterminada");
    expect(provenanceLabel({ ...c, classification_source: "regra_aprendida", classification_rule_id: "r1" })).toBe("Regra aprendida");
    expect(provenanceLabel({ ...c, classification_source: "manual" })).toBe("Origem histórica indeterminada");
    expect(provenanceLabel({ ...c, classification_source: "manual", classified_by: "u" })).toBe("Manual");
    expect(provenanceLabel({ ...c, category_id: null, classification_source: "nao_classificado" })).toBe("");
  });
});
