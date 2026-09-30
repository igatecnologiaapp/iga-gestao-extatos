import { describe, expect, it } from "vitest";
import { resolveCategoryId, suggestCategoryName } from "@/lib/importers";

const cats = [
  { id: "c", name: "Compra" },
  { id: "t", name: "Taxa" },
  { id: "j", name: "Juros" },
];

describe("classificação conservadora", () => {
  it("Pagamento Efetuado -R$ 25,16 nunca vira Compra", () => {
    expect(suggestCategoryName("Pagamento Efetuado")).not.toBe("Compra");
    expect(resolveCategoryId("Pagamento Efetuado", cats)).toBeNull(); // sem categoria Pagamento → Não classificado
    expect(resolveCategoryId("Pagamento Efetuado", [...cats, { id: "p", name: "Pagamento" }])).toBe("p");
  });
  it("pagamento recebido / de fatura", () => {
    for (const d of ["PAGAMENTO RECEBIDO", "Pagamento de Fatura", "PGTO FATURA"])
      expect(resolveCategoryId(d, cats)).toBeNull();
  });
  it("compra comum, juros, multa, IOF", () => {
    expect(suggestCategoryName("COMPRA POSTO IPIRANGA")).toBe("Compra");
    expect(suggestCategoryName("Juros De Mora")).toBe("Juros");
    expect(suggestCategoryName("Multa De Atraso")).toBe("Juros");
    expect(suggestCategoryName("Iof")).toBe("Taxa");
  });
  it("estorno/crédito → Não classificado", () => {
    expect(suggestCategoryName("ESTORNO COMPRA DUPLICADA")).toBeNull();
    expect(suggestCategoryName("Credito em fatura")).toBeNull();
  });
  it("sem confiança → Não classificado", () => {
    expect(suggestCategoryName("Pier Seguradora")).toBeNull();
    expect(suggestCategoryName("Dl *google Serasa Cons")).toBeNull();
  });
});
