import { describe, expect, it } from "vitest";
import { formatBRL, maskCard, parseBRL } from "@/lib/format";

describe("formatBRL", () => {
  it("formata número no padrão pt-BR", () => {
    expect(formatBRL(1234.56)).toContain("1.234,56");
  });

  it("aceita string numérica", () => {
    expect(formatBRL("2500")).toContain("2.500,00");
  });

  it("retorna traço para null, undefined e vazio", () => {
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(undefined)).toBe("—");
    expect(formatBRL("")).toBe("—");
  });

  it("retorna traço para texto não numérico", () => {
    expect(formatBRL("abc")).toBe("—");
  });

  it("formata zero corretamente", () => {
    expect(formatBRL(0)).toContain("0,00");
  });
});

describe("parseBRL", () => {
  it("converte formato pt-BR com milhar e vírgula", () => {
    expect(parseBRL("1.234,56")).toBe(1234.56);
  });

  it("converte valor com símbolo de moeda", () => {
    expect(parseBRL("R$ 2.500,00")).toBe(2500);
  });

  it("converte padrão internacional com ponto decimal", () => {
    expect(parseBRL("1234.56")).toBe(1234.56);
  });

  it("rejeita valores negativos", () => {
    expect(parseBRL("-10")).toBeNull();
  });

  it("rejeita entrada vazia", () => {
    expect(parseBRL("")).toBeNull();
    expect(parseBRL("   ")).toBeNull();
  });

  it("rejeita texto não numérico", () => {
    expect(parseBRL("abc")).toBeNull();
  });
});

describe("maskCard", () => {
  it("exibe apenas os últimos 4 dígitos", () => {
    expect(maskCard("1234")).toBe("•••• 1234");
  });

  it("nunca expõe número completo do cartão", () => {
    expect(maskCard("4321")).not.toContain("4321".padStart(16, "4"));
    expect(maskCard("4321")).toMatch(/^•••• \d{4}$/);
  });

  it("retorna traço quando não há dígitos", () => {
    expect(maskCard(null)).toBe("—");
    expect(maskCard(undefined)).toBe("—");
  });
});
