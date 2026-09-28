import { describe, expect, it } from "vitest";
import {
  computeLimits,
  cycleForCompetence,
  cycleForPurchase,
  deriveInvoiceStatus,
  dueTone,
  inferChargeKind,
  installmentBase,
  isPossiblePaymentMatch,
  parseInstallment,
  shiftCompetence,
  shiftDate,
  splitInstallments,
} from "@/lib/invoices";

describe("competência da fatura", () => {
  it("compra antes do fechamento → fatura corrente", () => {
    const c = cycleForPurchase("2026-09-05", 10, 20);
    expect(c).toEqual({ competence: "2026-09-01", periodStart: "2026-08-10", closingDate: "2026-09-10", dueDate: "2026-09-20" });
  });
  it("compra no dia/após o fechamento → próxima fatura", () => {
    expect(cycleForPurchase("2026-09-10", 10, 20).competence).toBe("2026-10-01");
    expect(cycleForPurchase("2026-09-25", 10, 20).competence).toBe("2026-10-01");
  });
  it("vencimento no mês seguinte quando dia venc. ≤ dia fech.", () => {
    const c = cycleForPurchase("2026-09-05", 25, 5);
    expect(c.closingDate).toBe("2026-09-25");
    expect(c.dueDate).toBe("2026-10-05");
    expect(c.competence).toBe("2026-10-01");
  });
  it("dezembro → janeiro", () => {
    const c = cycleForPurchase("2026-12-28", 25, 5);
    expect(c.closingDate).toBe("2027-01-25");
    expect(c.dueDate).toBe("2027-02-05");
    expect(cycleForPurchase("2026-12-20", 25, 5).dueDate).toBe("2027-01-05");
  });
  it("fevereiro sem dia 31 e ano bissexto", () => {
    expect(cycleForPurchase("2026-02-10", 31, 10).closingDate).toBe("2026-02-28");
    expect(cycleForPurchase("2028-02-10", 31, 10).closingDate).toBe("2028-02-29");
    // 28/02 é o fechamento (30 limitado a 28) → próxima fatura: fecha 30/03, vence 10/04
    expect(cycleForPurchase("2026-02-28", 30, 10).competence).toBe("2026-04-01");
    expect(cycleForPurchase("2026-01-15", 5, 30).dueDate).toBe("2026-02-28");
  });
  it("ciclo por competência é consistente com ciclo por compra", () => {
    const byPurchase = cycleForPurchase("2026-09-05", 25, 5);
    expect(cycleForCompetence(byPurchase.competence, 25, 5)).toEqual(byPurchase);
  });
  it("rejeita dias inválidos", () => {
    expect(() => cycleForPurchase("2026-09-05", 0, 5)).toThrow();
    expect(() => cycleForPurchase("2026-02-30", 10, 20)).toThrow();
  });
});

describe("status e vencimento", () => {
  const base = { closingDate: "2026-09-10", dueDate: "2026-09-20" };
  it("aberta, fechada, vencida, parcial, paga, cancelada", () => {
    expect(deriveInvoiceStatus({ ...base, lifecycle: "aberta", total: 100, paid: 0, today: "2026-09-01" })).toBe("aberta");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "aberta", total: 100, paid: 0, today: "2026-09-12" })).toBe("fechada");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "fechada", total: 100, paid: 0, today: "2026-09-21" })).toBe("vencida");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "fechada", total: 5000, paid: 3000, today: "2026-09-15" })).toBe("parcialmente_paga");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "fechada", total: 5000, paid: 5000, today: "2026-09-25" })).toBe("paga");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "cancelada", total: 5000, paid: 0, today: "2026-09-25" })).toBe("cancelada");
  });
  it("múltiplos pagamentos parciais vencida quando há saldo após vencimento", () => {
    expect(deriveInvoiceStatus({ ...base, lifecycle: "fechada", total: 5000, paid: 1000 + 2000, today: "2026-09-21" })).toBe("vencida");
  });
  it("sinalização verde/amarelo/vermelho", () => {
    const t = { dueDate: "2026-09-20", alertDays: 3, status: "fechada" as const };
    expect(dueTone({ ...t, balance: 100, today: "2026-09-10" })).toBe("verde");
    expect(dueTone({ ...t, balance: 100, today: "2026-09-18" })).toBe("amarelo");
    expect(dueTone({ ...t, balance: 100, today: "2026-09-21" })).toBe("vermelho");
    expect(dueTone({ ...t, balance: 0, today: "2026-09-21" })).toBe("verde");
  });
  it("limites", () => {
    expect(computeLimits(10000, [2000, -50, 500])).toEqual({ total: 10000, used: 2500, available: 7500 });
    expect(computeLimits(null, [100]).available).toBeNull();
  });
});

describe("lançamentos, créditos e estornos", () => {
  it("infere natureza", () => {
    expect(inferChargeKind("ESTORNO COMPRA DUPLICADA", "entrada")).toBe("estorno");
    expect(inferChargeKind("Devolução loja", "entrada")).toBe("devolucao");
    expect(inferChargeKind("CREDITO PROMOCIONAL", "entrada")).toBe("credito");
    expect(inferChargeKind("PAGAMENTO RECEBIDO", "entrada")).toBe("pagamento");
    expect(inferChargeKind("JUROS DE MORA", "saida")).toBe("juros");
    expect(inferChargeKind("IOF COMPRA EXTERIOR", "saida")).toBe("encargo");
    expect(inferChargeKind("ANUIDADE DIFERENCIADA", "saida")).toBe("tarifa");
    expect(inferChargeKind("COMPRA POSTO", "saida")).toBe("compra");
  });
  it("possível pagamento já existente no extrato", () => {
    expect(isPossiblePaymentMatch({ paidAt: "2026-09-20", amount: 3000 }, { postedAt: "2026-09-22", amount: 3000, direction: "saida" })).toBe(true);
    expect(isPossiblePaymentMatch({ paidAt: "2026-09-20", amount: 3000 }, { postedAt: "2026-10-05", amount: 3000, direction: "saida" })).toBe(false);
    expect(isPossiblePaymentMatch({ paidAt: "2026-09-20", amount: 3000 }, { postedAt: "2026-09-20", amount: 3000, direction: "entrada" })).toBe(false);
  });
});

describe("parcelamento", () => {
  it("interpreta parcela 1/N, intermediária e última", () => {
    expect(parseInstallment("Notebook — Parcela 01/10")).toEqual({ number: 1, total: 10 });
    expect(parseInstallment("NOTEBOOK PARC 03/10")).toEqual({ number: 3, total: 10 });
    expect(parseInstallment("Notebook parcela 10 de 10")).toEqual({ number: 10, total: 10 });
    expect(parseInstallment("COMPRA 02/01")).toBeNull();
    expect(parseInstallment("PARC 11/10")).toBeNull();
  });
  it("base igual entre manual e importada (evita duplicidade)", () => {
    expect(installmentBase("Notebook — Parcela 03/10")).toBe(installmentBase("NOTEBOOK PARC 03/10"));
  });
  it("competência de cada parcela", () => {
    expect(shiftCompetence("2026-11-01", 2)).toBe("2027-01-01");
    expect(shiftDate("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("divide em centavos sem perder valor", () => {
    const v = splitInstallments(1000, 3);
    expect(v).toEqual([333.34, 333.33, 333.33]);
    expect(v.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 2);
  });
});
