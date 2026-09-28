import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/backend-client";
import type { CardInvoice, InvoiceSummary } from "@/lib/invoice-service";
import {
  deriveInvoiceStatus,
  dueTone,
  invoiceBalance,
  todayIso,
  type DueTone,
  type InvoiceDisplayStatus,
} from "@/lib/invoices";

export type InvoiceCard = {
  id: string;
  company_id: string;
  nickname: string;
  last_four_digits: string | null;
  brand: string | null;
  type: string;
  status: string;
  closing_day: number | null;
  due_day: number | null;
  credit_limit: number | null;
  institution_id: string | null;
  account_id: string | null;
  financial_institutions: { name: string } | null;
};

export type InvoiceView = CardInvoice & {
  summary: InvoiceSummary | null;
  total: number;
  paid: number;
  balance: number;
  displayStatus: InvoiceDisplayStatus;
  tone: DueTone;
  card: InvoiceCard | null;
};

export function enrichInvoice(
  invoice: CardInvoice,
  summary: InvoiceSummary | null,
  card: InvoiceCard | null,
  alertDays: number,
  today = todayIso(),
): InvoiceView {
  const total = Number(summary?.total ?? 0);
  const paid = Number(summary?.paid ?? 0);
  const balance = invoiceBalance(total, paid);
  const displayStatus = deriveInvoiceStatus({
    lifecycle: invoice.status,
    total,
    paid,
    closingDate: invoice.closing_date,
    dueDate: invoice.due_date,
    today,
  });
  const tone = dueTone({ dueDate: invoice.due_date, balance, today, alertDays, status: displayStatus });
  return { ...invoice, summary, total, paid, balance, displayStatus, tone, card };
}

export function useInvoiceCards(companyId: string) {
  return useQuery({
    queryKey: ["invoice-cards", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select(
          "id, company_id, nickname, last_four_digits, brand, type, status, closing_day, due_day, credit_limit, institution_id, account_id, financial_institutions!institution_id(name)",
        )
        .eq("company_id", companyId)
        .order("nickname");
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceCard[];
    },
  });
}

export function useInvoices(companyId: string) {
  return useQuery({
    queryKey: ["invoices", companyId],
    queryFn: async () => {
      const [inv, sum] = await Promise.all([
        supabase
          .from("card_invoices")
          .select("*")
          .eq("company_id", companyId)
          .order("competence", { ascending: false })
          .limit(1000),
        supabase.from("card_invoice_summary").select("*").eq("company_id", companyId).limit(1000),
      ]);
      if (inv.error) throw inv.error;
      if (sum.error) throw sum.error;
      const byId = new Map((sum.data ?? []).map((s) => [s.invoice_id, s]));
      return (inv.data ?? []).map((i) => ({ invoice: i, summary: byId.get(i.id) ?? null }));
    },
  });
}
