import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Wallet } from "lucide-react";

import { AccessDenied, AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/lib/backend-client";
import { APP_NAME, type Company } from "@/lib/domain";
import { formatBRL, formatDate, maskCard } from "@/lib/format";
import { formatCompetence } from "@/lib/invoices";
import { useInvoiceCards } from "@/lib/use-invoices";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/pagamentos-faturas")({
  head: () => ({
    meta: [
      { title: `Pagamentos de faturas — ${APP_NAME}` },
      { name: "description", content: "Pagamentos totais e parciais registrados nas faturas de cartão." },
      { property: "og:title", content: `Pagamentos de faturas — ${APP_NAME}` },
      { property: "og:description", content: "Histórico de pagamentos de faturas por cartão e conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

const ALL = "__all__";

function PaymentsPage() {
  return <RequireCompany>{({ company }) => <PaymentsContent company={company} />}</RequireCompany>;
}

type PaymentRow = {
  id: string;
  invoice_id: string;
  paid_at: string;
  amount: number;
  status: "ativo" | "inativo";
  notes: string | null;
  bank_transaction_id: string | null;
  bank_accounts: { nickname: string | null; account_number: string } | null;
  card_invoices: { competence: string; card_id: string; due_date: string } | null;
};

function PaymentsContent({ company }: { company: Company }) {
  const { hasPermission } = useCompany();
  const canView = hasPermission("invoice.view");
  const cardsQuery = useInvoiceCards(company.id);
  const [f, setF] = useState({ card: ALL, month: "", status: "ativo", search: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["all-invoice-payments", company.id],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("id, invoice_id, paid_at, amount, status, notes, bank_transaction_id, bank_accounts(nickname, account_number), card_invoices(competence, card_id, due_date)")
        .eq("company_id", company.id)
        .order("paid_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

  const cardById = useMemo(() => new Map((cardsQuery.data ?? []).map((c) => [c.id, c])), [cardsQuery.data]);
  const rows = (data ?? []).filter((p) => {
    if (f.status !== ALL && p.status !== f.status) return false;
    if (f.card !== ALL && p.card_invoices?.card_id !== f.card) return false;
    if (f.month && !p.paid_at.startsWith(f.month)) return false;
    const q = f.search.trim().toLowerCase();
    if (q && !(p.notes ?? "").toLowerCase().includes(q) && !(cardById.get(p.card_invoices?.card_id ?? "")?.nickname ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
  const total = rows.filter((r) => r.status === "ativo").reduce((s, r) => s + Number(r.amount), 0);

  if (!canView) {
    return (
      <AppShell title="Pagamentos de faturas">
        <AccessDenied />
      </AppShell>
    );
  }

  return (
    <AppShell title="Pagamentos de faturas" description="Registre pagamentos a partir da fatura detalhada">
      <div className="mb-4 grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" aria-label="Pesquisar" placeholder="Cartão ou observação…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
        </div>
        <Select value={f.card} onValueChange={(v) => setF({ ...f, card: v })}>
          <SelectTrigger aria-label="Cartão"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os cartões</SelectItem>
            {(cardsQuery.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nickname} {maskCard(c.last_four_digits)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
          <SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Estornados</SelectItem>
            <SelectItem value={ALL}>Todos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label htmlFor="pm" className="shrink-0 text-xs">Mês</Label>
          <Input id="pm" type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} />
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {rows.length} pagamento(s) · total ativo <strong className="tabular text-foreground">{formatBRL(total)}</strong>
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhum pagamento" description="Abra uma fatura em Faturas e use “Registrar pagamento”." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cartão / Fatura</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const card = cardById.get(p.card_invoices?.card_id ?? "");
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="tabular">{formatDate(p.paid_at)}</TableCell>
                      <TableCell>
                        <Link to="/faturas/$id" params={{ id: p.invoice_id }} className="font-medium hover:underline">
                          {card?.nickname ?? "—"} · {p.card_invoices ? formatCompetence(p.card_invoices.competence) : "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{p.bank_accounts ? p.bank_accounts.nickname || p.bank_accounts.account_number : "—"}{p.bank_transaction_id ? " · vinculado ao extrato" : ""}</TableCell>
                      <TableCell className="max-w-60 truncate">{p.notes ?? "—"}</TableCell>
                      <TableCell className="tabular text-right font-medium">{formatBRL(p.amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.status === "ativo" ? "border-transparent bg-success/15 text-success" : "border-transparent bg-muted text-muted-foreground"}>
                          {p.status === "ativo" ? "Ativo" : "Estornado"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <ul className="space-y-2 lg:hidden">
            {rows.map((p) => {
              const card = cardById.get(p.card_invoices?.card_id ?? "");
              return (
                <li key={p.id}>
                  <Link to="/faturas/$id" params={{ id: p.invoice_id }} className="block rounded-xl border border-border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{card?.nickname ?? "—"} · {p.card_invoices ? formatCompetence(p.card_invoices.competence) : "—"}</p>
                      <p className={`tabular font-semibold ${p.status !== "ativo" ? "line-through opacity-60" : ""}`}>{formatBRL(p.amount)}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(p.paid_at)} · {p.bank_accounts ? p.bank_accounts.nickname || p.bank_accounts.account_number : "Conta não informada"}
                      {p.status !== "ativo" ? " · Estornado" : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AppShell>
  );
}
