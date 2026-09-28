import { supabase } from "@/lib/backend-client";
import type { Database } from "@/integrations/supabase/types";
import { fingerprintOf, normalizeDescription } from "@/lib/importers/shared";
import {
  cycleForCompetence,
  cycleForPurchase,
  inferChargeKind,
  installmentBase,
  isValidDay,
  parseInstallment,
  shiftCompetence,
  shiftDate,
  splitInstallments,
  type ChargeKind,
  type InvoiceCycle,
} from "@/lib/invoices";

export type CardInvoice = Database["public"]["Tables"]["card_invoices"]["Row"];
export type InvoicePayment = Database["public"]["Tables"]["invoice_payments"]["Row"];
export type InvoiceSummary = Database["public"]["Views"]["card_invoice_summary"]["Row"];

type CardLike = {
  id: string;
  company_id: string;
  closing_day: number | null;
  due_day: number | null;
  institution_id: string | null;
};

export function cardHasCycle(card: Pick<CardLike, "closing_day" | "due_day">): boolean {
  return isValidDay(card.closing_day) && isValidDay(card.due_day);
}

/**
 * Garante a fatura (cartão + competência) de forma idempotente:
 * a restrição única (card_id, competence) impede fatura duplicada.
 */
export async function ensureInvoice(
  card: CardLike,
  cycle: InvoiceCycle,
  userId: string | null,
): Promise<CardInvoice> {
  const { error: upsertError } = await supabase.from("card_invoices").upsert(
    {
      company_id: card.company_id,
      card_id: card.id,
      competence: cycle.competence,
      period_start: cycle.periodStart,
      closing_date: cycle.closingDate,
      due_date: cycle.dueDate,
      created_by: userId,
    },
    { onConflict: "card_id,competence", ignoreDuplicates: true },
  );
  if (upsertError) throw upsertError;
  const { data, error } = await supabase
    .from("card_invoices")
    .select("*")
    .eq("card_id", card.id)
    .eq("competence", cycle.competence)
    .single();
  if (error) throw error;
  return data;
}

export async function ensureInvoiceForCompetence(card: CardLike, competence: string, userId: string | null) {
  if (!cardHasCycle(card)) throw new Error("Cadastre os dias de fechamento e vencimento do cartão.");
  return ensureInvoice(card, cycleForCompetence(competence, card.closing_day!, card.due_day!), userId);
}

export type AssignResult = { linked: number; skippedNoDate: number; skippedCancelled: number; invoices: number };

/**
 * Associa à fatura correta os lançamentos do cartão ainda sem fatura.
 * Não cria nem duplica lançamentos: apenas preenche o vínculo (idempotente).
 */
export async function autoAssignCardTransactions(card: CardLike, userId: string | null): Promise<AssignResult> {
  if (!cardHasCycle(card)) throw new Error("Cadastre os dias de fechamento e vencimento do cartão.");
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("id, posted_at, description, direction, charge_kind, installment_number")
    .eq("company_id", card.company_id)
    .eq("card_id", card.id)
    .eq("status", "ativo")
    .is("invoice_id", null)
    .limit(5000);
  if (error) throw error;

  const result: AssignResult = { linked: 0, skippedNoDate: 0, skippedCancelled: 0, invoices: 0 };
  const byCompetence = new Map<string, { cycle: InvoiceCycle; txs: NonNullable<typeof txs> }>();
  for (const tx of txs ?? []) {
    if (!tx.posted_at) {
      result.skippedNoDate++;
      continue;
    }
    const cycle = cycleForPurchase(tx.posted_at, card.closing_day!, card.due_day!);
    const group = byCompetence.get(cycle.competence) ?? { cycle, txs: [] };
    group.txs.push(tx);
    byCompetence.set(cycle.competence, group);
  }

  for (const { cycle, txs: group } of byCompetence.values()) {
    const invoice = await ensureInvoice(card, cycle, userId);
    result.invoices++;
    if (invoice.status === "cancelada") {
      result.skippedCancelled += group.length;
      continue;
    }
    // Agrupa por natureza a preencher para minimizar chamadas.
    const buckets = new Map<string, string[]>();
    for (const tx of group) {
      const kind: ChargeKind = (tx.charge_kind as ChargeKind | null) ?? inferChargeKind(tx.description, tx.direction);
      const inst = tx.installment_number ? null : parseInstallment(tx.description);
      const key = `${kind}|${inst ? `${inst.number}/${inst.total}` : ""}`;
      buckets.set(key, [...(buckets.get(key) ?? []), tx.id]);
    }
    for (const [key, ids] of buckets) {
      const [kind, inst] = key.split("|");
      const patch: Database["public"]["Tables"]["transactions"]["Update"] = {
        invoice_id: invoice.id,
        charge_kind: kind as ChargeKind,
        updated_by: userId,
      };
      if (inst) {
        const [n = 0, t = 0] = inst.split("/").map(Number);
        patch.installment_number = n;
        patch.installment_total = t;
      }
      const { data: updated, error: upErr } = await supabase
        .from("transactions")
        .update(patch)
        .in("id", ids)
        .is("invoice_id", null)
        .select("id");
      if (upErr) throw upErr;
      result.linked += updated?.length ?? 0;
    }
  }
  return result;
}

export async function linkTransactions(invoice: CardInvoice, ids: string[], userId: string | null) {
  if (ids.length === 0) return 0;
  const { data: rows, error: readErr } = await supabase
    .from("transactions")
    .select("id, description, direction, charge_kind")
    .in("id", ids)
    .is("invoice_id", null);
  if (readErr) throw readErr;
  let linked = 0;
  for (const tx of rows ?? []) {
    const { data, error } = await supabase
      .from("transactions")
      .update({
        invoice_id: invoice.id,
        charge_kind: (tx.charge_kind as ChargeKind | null) ?? inferChargeKind(tx.description, tx.direction),
        updated_by: userId,
      })
      .eq("id", tx.id)
      .is("invoice_id", null)
      .select("id");
    if (error) throw error;
    linked += data?.length ?? 0;
  }
  return linked;
}

export async function unlinkTransaction(txId: string, userId: string | null) {
  const { error } = await supabase
    .from("transactions")
    .update({ invoice_id: null, updated_by: userId })
    .eq("id", txId);
  if (error) throw error;
}

export type InstallmentInput = {
  card: CardLike;
  description: string;
  totalAmount: number;
  count: number;
  purchaseDate: string;
  categoryId: string | null;
  groupId: string; // gerado uma vez por formulário → idempotente
  userId: string | null;
};

export type InstallmentResult = { created: number; alreadyImported: number[]; alreadyCreated: number };

/**
 * Lança uma compra parcelada: uma parcela por fatura (competência inicial + i).
 * Parcelas já importadas (mesma descrição base, nº e total de parcelas no cartão)
 * não são recriadas; reenvio do mesmo formulário não duplica (índice único).
 */
export async function createInstallmentPurchase(input: InstallmentInput): Promise<InstallmentResult> {
  const { card, description, totalAmount, count, purchaseDate, categoryId, groupId, userId } = input;
  if (!cardHasCycle(card)) throw new Error("Cadastre os dias de fechamento e vencimento do cartão.");
  if (count < 2 || count > 99) throw new Error("Informe entre 2 e 99 parcelas.");
  if (!(totalAmount > 0)) throw new Error("Informe o valor total da compra.");

  const base = installmentBase(description);
  const { data: existing, error } = await supabase
    .from("transactions")
    .select("id, description, installment_number, installment_total, installment_group")
    .eq("company_id", card.company_id)
    .eq("card_id", card.id)
    .eq("status", "ativo")
    .not("installment_number", "is", null);
  if (error) throw error;
  const importedNumbers = new Set<number>();
  const createdNumbers = new Set<number>();
  for (const e of existing ?? []) {
    if (e.installment_group === groupId && e.installment_number) createdNumbers.add(e.installment_number);
    else if (e.installment_total === count && installmentBase(e.description) === base && e.installment_number)
      importedNumbers.add(e.installment_number);
  }

  const firstCycle = cycleForPurchase(purchaseDate, card.closing_day!, card.due_day!);
  const values = splitInstallments(totalAmount, count);
  let created = 0;
  for (let i = 1; i <= count; i++) {
    if (importedNumbers.has(i) || createdNumbers.has(i)) continue;
    const competence = shiftCompetence(firstCycle.competence, i - 1);
    const invoice = await ensureInvoiceForCompetence(card, competence, userId);
    if (invoice.status === "cancelada") continue;
    const desc = `${description.trim()} — Parcela ${String(i).padStart(2, "0")}/${String(count).padStart(2, "0")}`;
    const postedAt = shiftDate(purchaseDate, i - 1);
    const { error: insErr } = await supabase.from("transactions").insert({
      company_id: card.company_id,
      source_type: "cartao",
      card_id: card.id,
      institution_id: card.institution_id,
      posted_at: postedAt,
      description: desc,
      normalized_description: normalizeDescription(desc),
      amount: values[i - 1] ?? 0,
      direction: "saida",
      category_id: categoryId,
      origin: "manual",
      invoice_id: invoice.id,
      charge_kind: "compra",
      installment_number: i,
      installment_total: count,
      installment_group: groupId,
      installment_total_amount: totalAmount,
      fingerprint: fingerprintOf({
        companyId: card.company_id,
        cardId: card.id,
        postedAt,
        amount: values[i - 1] ?? 0,
        direction: "saida",
        description: desc,
      }),
      created_by: userId,
      updated_by: userId,
    });
    if (insErr) {
      if (insErr.code === "23505") continue; // parcela já criada (reenvio)
      throw insErr;
    }
    created++;
  }
  return { created, alreadyImported: [...importedNumbers].sort((a, b) => a - b), alreadyCreated: createdNumbers.size };
}

export type PaymentInput = {
  invoice: CardInvoice;
  paidAt: string;
  amount: number;
  accountId: string | null;
  bankTransactionId: string | null;
  notes: string | null;
  idempotencyKey: string;
  userId: string | null;
};

/** Registra pagamento; a chave de idempotência impede duplicidade por reenvio. */
export async function registerPayment(input: PaymentInput): Promise<{ duplicate: boolean }> {
  const { error } = await supabase.from("invoice_payments").insert({
    company_id: input.invoice.company_id,
    invoice_id: input.invoice.id,
    paid_at: input.paidAt,
    amount: input.amount,
    account_id: input.accountId,
    bank_transaction_id: input.bankTransactionId,
    notes: input.notes,
    idempotency_key: input.idempotencyKey,
    created_by: input.userId,
  });
  if (error) {
    if (error.code === "23505") return { duplicate: true };
    throw error;
  }
  return { duplicate: false };
}

/** Débitos bancários candidatos a serem o pagamento desta fatura (sem conciliar). */
export async function findPossibleBankPayments(companyId: string, accountId: string, paidAt: string, amount: number) {
  const from = shiftDays(paidAt, -5);
  const to = shiftDays(paidAt, 5);
  const { data, error } = await supabase
    .from("transactions")
    .select("id, posted_at, description, amount, direction")
    .eq("company_id", companyId)
    .eq("account_id", accountId)
    .eq("status", "ativo")
    .eq("direction", "saida")
    .eq("amount", amount)
    .gte("posted_at", from)
    .lte("posted_at", to)
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function friendlyInvoiceError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const map: Record<string, string> = {
    fatura_cancelada: "A fatura está cancelada e não aceita novos vínculos ou pagamentos.",
    lancamento_de_outro_cartao: "O lançamento pertence a outro cartão.",
    fatura_nao_pertence_a_empresa: "Fatura não encontrada nesta empresa.",
    conta_nao_pertence_a_empresa: "A conta selecionada não pertence a esta empresa.",
    cartao_nao_pertence_a_empresa: "O cartão não pertence a esta empresa.",
    pagamento_valor_imutavel: "O valor de um pagamento registrado não pode ser alterado; estorne e registre novamente.",
  };
  for (const [k, v] of Object.entries(map)) if (msg.includes(k)) return v;
  if (msg.includes("row-level security")) return "Seu papel não tem permissão para esta operação.";
  return msg || "Falha na operação.";
}
