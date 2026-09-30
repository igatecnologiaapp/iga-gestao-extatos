import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, isLearnable, stablePattern, type RuleLike } from "@/lib/importers/classification-memory";
import { parsePdfText } from "@/lib/importers";

const A = "company-a";
const B = "company-b";
const cats = [
  { id: "seg", name: "Seguros", status: "ativo" },
  { id: "srv", name: "Serviços", status: "ativo" },
  { id: "old", name: "Antiga", status: "inativo" },
  { id: "c", name: "Compra", status: "ativo" },
  { id: "p", name: "Pagamento", status: "ativo" },
];
const subs = [
  { id: "emp", name: "Seguro Empresarial", category_id: "seg", status: "ativo" },
  { id: "subinat", name: "Inativa", category_id: "seg", status: "inativo" },
];
let n = 0;
const rule = (p: Partial<RuleLike>): RuleLike => ({
  id: `r${++n}`, company_id: A, pattern: "pier seguradora", match_type: "exata",
  category_id: "seg", subcategory_id: "emp", origin: "aprendida", rejected_count: 0, status: "ativo", ...p,
});
const run = (description: string, rules: RuleLike[], companyId = A) =>
  classify({ companyId, description, rules, categories: cats, subcategories: subs });

describe("normalização estável", () => {
  it("caixa, espaços, parcelas e números", () => {
    expect(stablePattern("  PIER   SEGURADORA ")).toBe("pier seguradora");
    expect(stablePattern("Pier Seguradora")).toBe("pier seguradora");
    expect(stablePattern("GETNINJAS PARCELA 07/10")).toBe(stablePattern("GETNINJAS PARCELA 08/10"));
    expect(stablePattern("PG *GETNINJAS Parcela 07/10")).toBe("pg getninjas");
    expect(stablePattern("UBER 12/08 NSU 948372")).toBe("uber nsu");
  });
});

describe("memória de classificação", () => {
  it("Caso 1/2 — exato e variação simples aplicam automaticamente", () => {
    const rules = [rule({})];
    for (const d of ["PIER SEGURADORA", "Pier Seguradora", "pier  seguradora"]) {
      const r = run(d, rules);
      expect(r).toMatchObject({ category_id: "seg", subcategory_id: "emp", source: "regra_aprendida" });
    }
  });
  it("Caso 3 — parcela variável reconhecida pelo padrão estável", () => {
    const rules = [rule({ pattern: "getninjas", category_id: "srv", subcategory_id: null })];
    expect(run("GETNINJAS PARCELA 08/10", rules).category_id).toBe("srv");
    // Com prefixo diferente, apenas sugere (não aplica).
    const r = run("PG *GETNINJAS PARCELA 08/10", rules);
    expect(r.category_id).toBeNull();
    expect(r.suggestion?.reason).toBe("similaridade");
  });
  it("não cria correspondência ampla demais", () => {
    const rules = [rule({ pattern: "pier", category_id: "seg" })];
    expect(run("PIERRE CAFE", rules).category_id).toBeNull();
    expect(run("PIERRE CAFE", rules).suggestion).toBeNull();
  });
  it("Caso 4 — ambiguidade não classifica", () => {
    const rules = [rule({ pattern: "amazon", category_id: "srv", subcategory_id: null }), rule({ pattern: "amazon", category_id: "seg", subcategory_id: null })];
    const r = run("AMAZON", rules);
    expect(r.category_id).toBeNull();
    expect(r.suggestion?.reason).toBe("ambigua");
    expect(r.suggestion?.options).toHaveLength(2);
  });
  it("Caso 5 — regra da Empresa A não vale para a Empresa B", () => {
    expect(run("PIER SEGURADORA", [rule({})], B)).toMatchObject({ category_id: null, suggestion: null });
  });
  it("Caso 6 — subcategoria/categoria inativa não aplica", () => {
    expect(run("PIER SEGURADORA", [rule({ subcategory_id: "subinat" })]).suggestion?.reason).toBe("regra_inativa");
    expect(run("PIER SEGURADORA", [rule({ category_id: "old", subcategory_id: null })]).category_id).toBeNull();
    expect(run("PIER SEGURADORA", [rule({ status: "inativo" })]).category_id).toBeNull();
  });
  it("Caso 7 — regra corrigida pelo usuário deixa de aplicar automaticamente", () => {
    const r = run("PIER SEGURADORA", [rule({ rejected_count: 1 })]);
    expect(r.category_id).toBeNull();
    expect(r.suggestion?.reason).toBe("regra_rejeitada");
    // Após a correção, a nova regra convive com a antiga → ambígua, nunca a "última" arbitrariamente.
    const r2 = run("PIER SEGURADORA", [rule({ rejected_count: 1 }), rule({ category_id: "srv", subcategory_id: null })]);
    expect(r2.category_id).toBeNull();
  });
  it("regra manual tem prioridade sobre memória aprendida", () => {
    const rules = [rule({ pattern: "seguradora", match_type: "contem", origin: "manual", category_id: "srv", subcategory_id: null }), rule({})];
    expect(run("PIER SEGURADORA", rules)).toMatchObject({ category_id: "srv", source: "regra_aprendida" });
  });
  it("semântica obrigatória vence memória ruim (Pagamento Efetuado nunca vira Compra)", () => {
    const bad = [rule({ pattern: "pagamento efetuado", category_id: "c", subcategory_id: null })];
    const r = run("Pagamento Efetuado", bad);
    expect(r.category_id).toBe("p");
    expect(r.source).toBe("regra_parser");
    expect(isLearnable("Pagamento Efetuado")).toBe(false);
    expect(isLearnable("Pier Seguradora")).toBe(true);
  });
  it("sem correspondência → Não classificado", () => {
    expect(run("LOJA DESCONHECIDA", [rule({})])).toMatchObject({ category_id: null, source: "nao_classificado", suggestion: null });
  });
});

describe("PAN — pagamento da fatura anterior", () => {
  const text = readFileSync("tests/fixtures/pan-setembro-2026-sanitizado.txt", "utf8").replace(/^--- pagina /gm, "\u000c--- pagina ");
  const { rows, integrity } = parsePdfText(text, { sourceType: "cartao", fallbackYear: 2026 });
  it("9 registros, pagamento preservado e informativo, total 249,95 validado", () => {
    expect(rows).toHaveLength(9);
    const pay = rows.find((r) => /pagamento efetuado/i.test(r.description))!;
    expect(pay.amount).toBe(25.16);
    expect(pay.direction).toBe("entrada");
    expect(pay.raw).toMatchObject({ nature: "pagamento", affects_invoice_total: false, refers_to: "fatura_anterior", signed_amount: -25.16 });
    const titular = integrity!.sections.find((s) => s.card_role === "titular")!;
    const adicional = integrity!.sections.find((s) => s.card_role === "adicional")!;
    expect(titular.purchases_total).toBe(0.8);
    expect(adicional.purchases_total).toBe(249.15);
    expect(integrity!.extracted_total).toBe(249.95);
    expect(integrity!.extracted_total).not.toBe(224.79);
    expect(integrity!.status).toBe("validada");
  });
});
