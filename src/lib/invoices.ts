/**
 * Fase 3 — Regras de competência, status e limites de faturas de cartão.
 * Funções puras (sem acesso ao banco), cobertas por testes unitários.
 *
 * Convenções adotadas:
 * - O fechamento de um mês M ocorre em min(dia de fechamento, último dia de M).
 *   Ex.: fechamento dia 31 em fevereiro de 2026 → 28/02/2026; em 2028 → 29/02/2028.
 * - Compra ANTES da data de fechamento → fatura que fecha naquele mês.
 *   Compra NO dia do fechamento ou depois → próxima fatura ("melhor dia de compra").
 * - Vencimento: se dia de vencimento > dia de fechamento, vence no mesmo mês do
 *   fechamento; caso contrário, no mês seguinte. Dias inexistentes são limitados
 *   ao último dia do mês (nunca cria datas impossíveis).
 * - Competência = mês do vencimento (ex.: "Fatura 09/2026" vence em setembro).
 * - Período da fatura = [fechamento anterior, fechamento − 1 dia].
 */

export type InvoiceCycle = {
  /** Primeiro dia do mês de competência, yyyy-mm-01. */
  competence: string;
  periodStart: string;
  closingDate: string;
  dueDate: string;
};

export type InvoiceLifecycle = "aberta" | "fechada" | "cancelada";
export type InvoiceDisplayStatus =
  | "aberta"
  | "fechada"
  | "vencida"
  | "parcialmente_paga"
  | "paga"
  | "cancelada";

export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  vencida: "Vencida",
  parcialmente_paga: "Parcialmente paga",
  paga: "Paga",
  cancelada: "Cancelada",
};

export type ChargeKind =
  | "compra"
  | "juros"
  | "encargo"
  | "tarifa"
  | "ajuste"
  | "credito"
  | "estorno"
  | "devolucao"
  | "pagamento";

export const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  compra: "Compra",
  juros: "Juros",
  encargo: "Encargo",
  tarifa: "Tarifa",
  ajuste: "Ajuste",
  credito: "Crédito",
  estorno: "Estorno",
  devolucao: "Devolução",
  pagamento: "Pagamento (linha da fatura)",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function lastDayOfMonth(year: number, month: number): number {
  // month: 1..12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Soma meses a (ano, mês) tratando dezembro → janeiro. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Data com dia limitado ao último dia do mês (evita 31/02, 30/02 etc.). */
export function clampedDate(year: number, month: number, day: number): string {
  return toIso(year, month, Math.min(day, lastDayOfMonth(year, month)));
}

function parseIso(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Data inválida: ${iso}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) {
    throw new Error(`Data inválida: ${iso}`);
  }
  return { year, month, day };
}

function prevDay(iso: string): string {
  const { year, month, day } = parseIso(iso);
  if (day > 1) return toIso(year, month, day - 1);
  const p = addMonths(year, month, -1);
  return toIso(p.year, p.month, lastDayOfMonth(p.year, p.month));
}

export function isValidDay(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31;
}

/** Ciclo da fatura que fecha no mês (year, month). */
export function cycleClosingIn(
  year: number,
  month: number,
  closingDay: number,
  dueDay: number,
): InvoiceCycle {
  const closingDate = clampedDate(year, month, closingDay);
  const prev = addMonths(year, month, -1);
  const periodStart = clampedDate(prev.year, prev.month, closingDay);
  const dueMonth = dueDay > closingDay ? { year, month } : addMonths(year, month, 1);
  const dueDate = clampedDate(dueMonth.year, dueMonth.month, dueDay);
  return {
    competence: toIso(dueMonth.year, dueMonth.month, 1),
    periodStart,
    closingDate,
    dueDate,
  };
}

/** Fatura à qual pertence uma compra realizada em `purchaseDate` (yyyy-mm-dd). */
export function cycleForPurchase(purchaseDate: string, closingDay: number, dueDay: number): InvoiceCycle {
  if (!isValidDay(closingDay) || !isValidDay(dueDay)) {
    throw new Error("Cartão sem dia de fechamento/vencimento válido.");
  }
  const { year, month } = parseIso(purchaseDate);
  const closingThisMonth = clampedDate(year, month, closingDay);
  if (purchaseDate < closingThisMonth) return cycleClosingIn(year, month, closingDay, dueDay);
  const next = addMonths(year, month, 1);
  return cycleClosingIn(next.year, next.month, closingDay, dueDay);
}

/** Ciclo de uma competência (yyyy-mm-01 ou yyyy-mm). */
export function cycleForCompetence(competence: string, closingDay: number, dueDay: number): InvoiceCycle {
  const m = /^(\d{4})-(\d{2})/.exec(competence);
  if (!m) throw new Error(`Competência inválida: ${competence}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const closingMonth = dueDay > closingDay ? { year, month } : addMonths(year, month, -1);
  return cycleClosingIn(closingMonth.year, closingMonth.month, closingDay, dueDay);
}

/** Competência deslocada em N meses (parcelas). */
export function shiftCompetence(competence: string, delta: number): string {
  const { year, month } = parseIso(competence.length === 7 ? `${competence}-01` : competence);
  const r = addMonths(year, month, delta);
  return toIso(r.year, r.month, 1);
}

/** Data da compra deslocada em N meses, com dia limitado ao fim do mês. */
export function shiftDate(iso: string, delta: number): string {
  const { year, month, day } = parseIso(iso);
  const r = addMonths(year, month, delta);
  return clampedDate(r.year, r.month, day);
}

export function formatCompetence(competence: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(competence);
  return m ? `${m[2]}/${m[1]}` : competence;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Status exibido, derivado dos dados financeiros (evita inconsistência manual). */
export function deriveInvoiceStatus(input: {
  lifecycle: InvoiceLifecycle;
  total: number;
  paid: number;
  closingDate: string;
  dueDate: string;
  today: string;
}): InvoiceDisplayStatus {
  const { lifecycle, total, paid, closingDate, dueDate, today } = input;
  if (lifecycle === "cancelada") return "cancelada";
  const balance = round2(total - paid);
  const closed = lifecycle === "fechada" || today >= closingDate;
  if (paid > 0 && balance <= 0) return "paga";
  if (today > dueDate && balance > 0) return "vencida";
  if (paid > 0) return "parcialmente_paga";
  return closed ? "fechada" : "aberta";
}

export function invoiceBalance(total: number, paid: number): number {
  return round2(total - paid);
}

export type DueTone = "verde" | "amarelo" | "vermelho" | "neutro";

/** Sinalização de vencimento: vermelho vencido c/ saldo, amarelo próximo, verde normal. */
export function dueTone(input: {
  dueDate: string;
  balance: number;
  today: string;
  alertDays: number;
  status: InvoiceDisplayStatus;
}): DueTone {
  const { dueDate, balance, today, alertDays, status } = input;
  if (status === "cancelada") return "neutro";
  if (balance <= 0) return "verde";
  if (today > dueDate) return "vermelho";
  const days = daysBetween(today, dueDate);
  if (days <= Math.max(0, alertDays)) return "amarelo";
  return "verde";
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  const a = Date.UTC(...(ymd(fromIso) as [number, number, number]));
  const b = Date.UTC(...(ymd(toIsoDate) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}

function ymd(iso: string): [number, number, number] {
  const { year, month, day } = parseIso(iso);
  return [year, month - 1, day];
}

/** Limites: disponível = total − compromissos considerados (saldos não pagos). */
export function computeLimits(creditLimit: number | null, openBalances: number[]) {
  const used = round2(openBalances.filter((b) => b > 0).reduce((s, b) => s + b, 0));
  if (creditLimit === null || creditLimit === undefined) {
    return { total: null, used, available: null };
  }
  return { total: creditLimit, used, available: round2(creditLimit - used) };
}

/** Natureza sugerida do lançamento de cartão a partir da descrição/sentido. */
export function inferChargeKind(description: string, direction: "entrada" | "saida"): ChargeKind {
  const t = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (direction === "entrada") {
    if (/\bestorno|\bestornad/.test(t)) return "estorno";
    if (/\bdevolu/.test(t)) return "devolucao";
    if (/\bajuste/.test(t)) return "ajuste";
    if (/\bpagamento|\bpgto\b/.test(t)) return "pagamento";
    return "credito";
  }
  if (/\bjuros|\bmora\b|\brotativo/.test(t)) return "juros";
  if (/\biof\b|\bencargo|\bmulta\b/.test(t)) return "encargo";
  if (/\banuidade|\btarifa|\btaxa\b/.test(t)) return "tarifa";
  if (/\bajuste/.test(t)) return "ajuste";
  return "compra";
}

/** Extrai "Parcela 03/10", "PARC 3/10", "3 de 10" da descrição (apenas com palavra-chave). */
export function parseInstallment(description: string): { number: number; total: number } | null {
  const t = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const m = /\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/.exec(t);
  if (!m) return null;
  const number = Number(m[1]);
  const total = Number(m[2]);
  if (number < 1 || total < 2 || number > total || total > 99) return null;
  return { number, total };
}

/** Descrição base sem o sufixo de parcela, para detectar parcelas já importadas. */
export function installmentBase(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[—–-]?\s*\bparc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function installmentLabel(n: number | null, total: number | null): string {
  if (!n || !total) return "—";
  return `${pad(n)}/${pad(total)}`;
}

/** Divide o total em N parcelas em centavos; a diferença de arredondamento vai na 1ª. */
export function splitInstallments(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const rest = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i === 0 ? rest : 0)) / 100);
}

/** Hoje em yyyy-mm-dd no fuso de São Paulo. */
export function todayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

/** Possível débito do pagamento já importado no extrato (±5 dias, mesmo valor). */
export function isPossiblePaymentMatch(
  payment: { paidAt: string; amount: number },
  tx: { postedAt: string; amount: number; direction: "entrada" | "saida" },
  toleranceDays = 5,
): boolean {
  if (tx.direction !== "saida") return false;
  if (Math.abs(round2(tx.amount) - round2(payment.amount)) > 0.009) return false;
  return Math.abs(daysBetween(payment.paidAt, tx.postedAt)) <= toleranceDays;
}
