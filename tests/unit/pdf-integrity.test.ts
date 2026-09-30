import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  detectDescriptionAnomalies,
  extractPdfTextWith,
  groupItemsIntoLines,
  parsePdfText,
} from "@/lib/importers";

const fx = (n: string) => resolve(process.cwd(), "tests/fixtures", n);
const card = { sourceType: "cartao" as const, fallbackYear: 2026 };

async function pdfText(name: string) {
  const b = readFileSync(fx(name));
  return extractPdfTextWith(
    pdfjs as never,
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
  );
}

describe("PAN setembro/2026 (fixture sanitizada do PDF real)", () => {
  const r = parsePdfText(readFileSync(fx("pan-setembro-2026-sanitizado.txt"), "utf8"), card);
  const titular = r.integrity!.sections.find((s) => s.card_last4 === "8012")!;
  const adicional = r.integrity!.sections.find((s) => s.card_last4 === "7181")!;

  it("separa 5 movimentos do titular e 4 do adicional, sem concatenação", () => {
    expect(r.rows).toHaveLength(9);
    expect(titular.count).toBe(5);
    expect(adicional.count).toBe(4);
    for (const row of r.rows) {
      expect(detectDescriptionAnomalies(row.description)).toEqual([]);
    }
    expect(r.rows.map((x) => x.description)).toEqual([
      "Pagamento Efetuado",
      "Juros De Mora",
      "Iof",
      "Multa De Atraso",
      "Juros De Atraso",
      "Pg *getninjas Parcela 07/10",
      "Pier Seguradora",
      "Dl *google Serasa Cons",
      "Pier Seguradora",
    ]);
  });

  it("preserva o pagamento -25,16 separado das compras/despesas", () => {
    const pg = r.rows[0]!;
    expect(pg.amount).toBe(25.16);
    expect(pg.raw.signed_amount).toBe(-25.16);
    expect(pg.raw.nature).toBe("pagamento");
    expect(pg.direction).toBe("entrada");
    expect(titular.payments_total).toBe(25.16);
  });

  it("natureza coerente: encargos e compras são saídas", () => {
    expect(r.rows.slice(1).every((x) => x.direction === "saida")).toBe(true);
    expect(r.rows[1]!.raw.nature).toBe("encargo");
    expect(r.rows[5]!.raw.nature).toBe("compra_despesa");
  });

  it("totais conciliam: 0,80 + 249,15 = 249,95 → VALIDADA", () => {
    expect(titular.purchases_total).toBe(0.8);
    expect(titular.difference).toBe(0);
    expect(adicional.purchases_total).toBe(249.15);
    expect(adicional.difference).toBe(0);
    expect(r.integrity!.declared_total).toBe(249.95);
    expect(r.integrity!.extracted_total).toBe(249.95);
    expect(r.integrity!.difference).toBe(0);
    expect(r.integrity!.status).toBe("validada");
  });

  it("não importa resumos, limites, parcelamentos nem totais como transações", () => {
    const amounts = r.rows.map((x) => x.amount);
    for (const v of [310, 37.83, 47.37, 284.22, 50.97, 9.08]) expect(amounts).not.toContain(v);
  });

  it("regressão: texto linearizado (espaço simples) do bug original também é separado", () => {
    const flat = [
      "Lançamentos do cartão Titular | Cartão final 8012",
      "05/08 Pagamento Efetuado -R$ 25,16 26/08 Juros De Mora R$ 0,01",
      "26/08 Iof R$ 0,02 26/08 Multa De Atraso R$ 0,38",
      "19/02 Pg *getninjas Parcela 07/10 R$ 16,99 09/08 Pier Seguradora R$ 104,13",
    ].join("\n");
    const x = parsePdfText(flat, card);
    expect(x.rows.map((y) => [y.description, y.amount])).toEqual([
      ["Pagamento Efetuado", 25.16],
      ["Juros De Mora", 0.01],
      ["Iof", 0.02],
      ["Multa De Atraso", 0.38],
      ["Pg *getninjas Parcela 07/10", 16.99],
      ["Pier Seguradora", 104.13],
    ]);
  });
});

describe("PDFs sintéticos (extração posicional real via pdf.js)", () => {
  it("tabela simples de conta corrente com sinais e C/D", async () => {
    const r = parsePdfText(await pdfText("pdf/simples.pdf"), { sourceType: "conta" });
    expect(r.rows.map((x) => [x.amount, x.direction])).toEqual([
      [1500, "entrada"],
      [39.9, "saida"],
      [250, "saida"],
    ]);
    expect(r.integrity!.status).toBe("revisao"); // sem totais declarados
  });

  it("duas colunas + duas seções + negativos + titular/adicional + total declarado", async () => {
    const r = parsePdfText(await pdfText("pdf/duas-colunas-secoes.pdf"), card);
    expect(r.rows).toHaveLength(6);
    const s = r.integrity!.sections;
    expect(s.map((x) => [x.card_last4, x.count])).toEqual([
      ["1111", 3],
      ["2222", 3],
    ]);
    expect(s[0]!.purchases_total).toBe(100);
    expect(s[0]!.payments_total).toBe(80);
    expect(s[1]!.credits_total).toBe(10);
    expect(r.integrity!.extracted_total).toBe(150);
    expect(r.integrity!.status).toBe("validada");
  });

  it("divergência proposital é sinalizada, nunca ajustada", async () => {
    const r = parsePdfText(await pdfText("pdf/divergente.pdf"), card);
    expect(r.integrity!.status).toBe("divergente");
    expect(r.integrity!.extracted_total).toBe(100);
    expect(r.integrity!.declared_total).toBe(999);
    expect(r.integrity!.difference).toBe(899);
    expect(r.rows.map((x) => x.amount)).toEqual([60, 40]);
  });
});

describe("anomalias e reconstrução de linhas", () => {
  it("detecta linha concatenada", () => {
    expect(
      detectDescriptionAnomalies("Pg *getninjas Parcela 07/10 R$ 16,99 09/08 Pier Seguradora"),
    ).toHaveLength(2);
    expect(detectDescriptionAnomalies("Pg *getninjas Parcela 07/10")).toEqual([]);
  });

  it("agrupa por Y com tolerância e marca lacunas de coluna", () => {
    const lines = groupItemsIntoLines([
      { x: 10, y: 100, w: 20, h: 8, str: "05/08" },
      { x: 300, y: 100.6, w: 20, h: 8, str: "26/08" },
      { x: 35, y: 99.8, w: 60, h: 8, str: "Pagamento" },
    ]);
    expect(lines).toEqual(["05/08 Pagamento   26/08"]);
  });
});
