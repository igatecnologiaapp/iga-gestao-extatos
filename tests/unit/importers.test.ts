import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  detectFormat,
  fingerprintOf,
  hashFile,
  normalizeDescription,
  parseAmount,
  parseCsv,
  parseDate,
  parseOfx,
  parsePdfText,
  parseXlsxBuffer,
  suggestCategoryName,
  ImportError,
} from "@/lib/importers";

const fixture = (name: string) => resolve(process.cwd(), "tests/fixtures", name);
const text = (name: string) => readFileSync(fixture(name), "utf8");

describe("detecção de formato", () => {
  it("reconhece formatos suportados", () => {
    expect(detectFormat("extrato.CSV")).toBe("csv");
    expect(detectFormat("extrato.ofx")).toBe("ofx");
    expect(detectFormat("fatura.pdf")).toBe("pdf");
    expect(detectFormat("planilha.xlsx")).toBe("xlsx");
    expect(detectFormat("planilha.xls")).toBe("xlsx");
  });

  it("rejeita formato não suportado com mensagem útil", () => {
    try {
      detectFormat("documento.docx");
      throw new Error("deveria falhar");
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
      expect((err as ImportError).code).toBe("formato_nao_suportado");
      expect((err as ImportError).message).toContain("PDF, OFX, CSV");
    }
  });
});

describe("valores e datas", () => {
  it("interpreta valores pt-BR e en-US", () => {
    expect(parseAmount("1.234,56").value).toBe(1234.56);
    expect(parseAmount("-1.234,56").negative).toBe(true);
    expect(parseAmount("(59,90)").negative).toBe(true);
    expect(parseAmount("R$ 3.500,00").value).toBe(3500);
    expect(parseAmount("1234.56").value).toBe(1234.56);
    expect(parseAmount(-42.5)).toEqual({ value: 42.5, negative: true, ambiguous: false });
  });

  it("não converte silenciosamente valores ambíguos", () => {
    expect(parseAmount("1,234").ambiguous).toBe(true);
    expect(parseAmount("1,234").value).toBeNull();
    expect(parseAmount("1.234").ambiguous).toBe(true);
  });

  it("interpreta datas em vários formatos", () => {
    expect(parseDate("02/01/2026")).toBe("2026-01-02");
    expect(parseDate("2026-01-02")).toBe("2026-01-02");
    expect(parseDate("20260102120000")).toBe("2026-01-02");
    expect(parseDate("02/13/2026")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("CSV", () => {
  const result = parseCsv(text("extrato.csv"));

  it("extrai múltiplos lançamentos e ignora linha de saldo", () => {
    expect(result.rows).toHaveLength(4);
  });

  it("preserva data, descrição, valor e natureza", () => {
    expect(result.rows[0]).toMatchObject({
      posted_at: "2026-01-02",
      amount: 1234.56,
      direction: "saida",
      currency: "BRL",
    });
    expect(result.rows[0]!.description).toContain("SUPERMERCADO");
    expect(result.rows[2]).toMatchObject({ amount: 3500, direction: "entrada" });
  });

  it("rejeita arquivo vazio", () => {
    expect(() => parseCsv("")).toThrowError(/vazio/i);
  });

  it("rejeita arquivo sem colunas reconhecíveis", () => {
    expect(() => parseCsv("a;b;c\n1;2;3")).toThrowError(/colunas/i);
  });
});

describe("OFX", () => {
  const result = parseOfx(text("extrato.ofx"));

  it("extrai os lançamentos do bloco STMTTRN", () => {
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      posted_at: "2026-01-02",
      amount: 1234.56,
      direction: "saida",
    });
    expect(result.rows[2]).toMatchObject({ direction: "entrada", amount: 3500 });
  });

  it("rejeita conteúdo que não é OFX", () => {
    expect(() => parseOfx("apenas um texto")).toThrowError(/OFX/i);
  });
});

describe("PDF (texto extraído)", () => {
  const result = parsePdfText(text("fatura-pdf.txt"));

  it("extrai lançamentos e descarta totais/saldos", () => {
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toMatchObject({ posted_at: "2026-01-02", amount: 320, direction: "saida" });
    expect(result.rows[2]).toMatchObject({ direction: "entrada", amount: 120 });
  });

  it("sinaliza documento sem movimentações", () => {
    expect(() => parsePdfText("Documento sem lançamentos\nApenas texto")).toThrowError(
      /movimentação/i,
    );
  });
});

describe("XLSX", () => {
  it("lê planilha com colunas de crédito e débito", async () => {
    const buffer = readFileSync(fixture("extrato.xlsx"));
    const result = await parseXlsxBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      posted_at: "2026-01-02",
      amount: 450.25,
      direction: "saida",
    });
    expect(result.rows[2]).toMatchObject({ amount: 1200, direction: "entrada" });
  });
});

describe("classificação inicial", () => {
  it("classifica compra, taxa e juros", () => {
    expect(suggestCategoryName("COMPRA CARTAO SUPERMERCADO")).toBe("Compra");
    expect(suggestCategoryName("TARIFA MANUTENCAO DE CONTA")).toBe("Taxa");
    expect(suggestCategoryName("ANUIDADE DIFERENCIADA")).toBe("Taxa");
    expect(suggestCategoryName("JUROS DE MORA")).toBe("Juros");
  });

  it("retorna nulo quando não há classificação segura", () => {
    expect(suggestCategoryName("TED 8842 CLIENTE ALFA")).toBeNull();
    expect(suggestCategoryName("")).toBeNull();
  });
});

describe("duplicidade", () => {
  const base = {
    companyId: "c1",
    accountId: "a1",
    postedAt: "2026-01-02",
    amount: 1234.56,
    direction: "saida" as const,
    description: "Compra Cartão  Supermercado",
  };

  it("mesmo lançamento gera a mesma impressão digital", () => {
    expect(fingerprintOf(base)).toBe(
      fingerprintOf({ ...base, description: "COMPRA CARTAO SUPERMERCADO" }),
    );
  });

  it("lançamento semelhante, mas não idêntico, difere", () => {
    expect(fingerprintOf({ ...base, amount: 1234.57 })).not.toBe(fingerprintOf(base));
    expect(fingerprintOf({ ...base, postedAt: "2026-01-03" })).not.toBe(fingerprintOf(base));
    expect(fingerprintOf({ ...base, description: "Compra padaria" })).not.toBe(fingerprintOf(base));
  });

  it("normaliza descrições para comparação", () => {
    expect(normalizeDescription("Tarifa  Manutenção-Conta")).toBe("tarifa manutencao conta");
  });

  it("mesmo arquivo gera o mesmo hash e arquivos diferentes divergem", async () => {
    const a = new TextEncoder().encode("conteudo-a").buffer as ArrayBuffer;
    const a2 = new TextEncoder().encode("conteudo-a").buffer as ArrayBuffer;
    const b = new TextEncoder().encode("conteudo-b").buffer as ArrayBuffer;
    expect(await hashFile(a)).toBe(await hashFile(a2));
    expect(await hashFile(a)).not.toBe(await hashFile(b));
  });
});
