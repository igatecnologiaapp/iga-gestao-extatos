import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Link2, Loader2, Search, Unlink, Wallet } from "lucide-react";
import { toast } from "sonner";

import { AccessDenied, AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DueDot, InvoiceStatusBadge } from "@/components/invoice-ui";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/lib/backend-client";
import { APP_NAME, ORIGIN_LABELS, type Company, type TransactionOrigin } from "@/lib/domain";
import { formatBRL, formatDate, formatDateTime, maskCard, parseBRL } from "@/lib/format";
import {
  CHARGE_KIND_LABELS,
  cycleForPurchase,
  formatCompetence,
  installmentLabel,
  todayIso,
  type ChargeKind,
} from "@/lib/invoices";
import {
  findPossibleBankPayments,
  friendlyInvoiceError,
  linkTransactions,
  registerPayment,
  unlinkTransaction,
  type CardInvoice,
} from "@/lib/invoice-service";
import { enrichInvoice, useInvoiceCards } from "@/lib/use-invoices";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/faturas/$id")({
  head: () => ({
    meta: [
      { title: `Fatura do cartão — ${APP_NAME}` },
      { name: "description", content: "Fatura detalhada: resumo, lançamentos, parcelas e pagamentos." },
      { property: "og:title", content: `Fatura do cartão — ${APP_NAME}` },
      { property: "og:description", content: "Detalhe da fatura de cartão por competência." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoiceDetailPage,
});

const ALL = "__all__";

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  return <RequireCompany>{({ company }) => <InvoiceDetail company={company} id={id} />}</RequireCompany>;
}

function InvoiceDetail({ company, id }: { company: Company; id: string }) {
  const { user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const canView = hasPermission("invoice.view");
  const canManage = hasPermission("invoice.manage");
  const canLink = canManage && hasPermission("transaction.manage");
  const canPay = hasPermission("invoice.pay");
  const userId = user?.id ?? null;

  const cardsQuery = useInvoiceCards(company.id);
  const invoiceQuery = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, sum] = await Promise.all([
        supabase.from("card_invoices").select("*").eq("id", id).eq("company_id", company.id).maybeSingle(),
        supabase.from("card_invoice_summary").select("*").eq("invoice_id", id).maybeSingle(),
      ]);
      if (inv.error) throw inv.error;
      if (sum.error) throw sum.error;
      return { invoice: inv.data, summary: sum.data };
    },
  });
  const txQuery = useQuery({
    queryKey: ["invoice-transactions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, posted_at, description, amount, direction, origin, charge_kind, installment_number, installment_total, import_id, category_id, transaction_categories(name)",
        )
        .eq("invoice_id", id)
        .eq("status", "ativo")
        .order("posted_at");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        posted_at: string;
        description: string;
        amount: number;
        direction: "entrada" | "saida";
        origin: TransactionOrigin;
        charge_kind: ChargeKind | null;
        installment_number: number | null;
        installment_total: number | null;
        import_id: string | null;
        category_id: string | null;
        transaction_categories: { name: string } | null;
      }>;
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["invoice-payments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_payments")
        .select("*, bank_accounts(nickname, account_number)")
        .eq("invoice_id", id)
        .order("paid_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState(ALL);
  const [linkOpen, setLinkOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; description: string; action: () => Promise<void> }>(null);

  const invoice = invoiceQuery.data?.invoice ?? null;
  const card = (cardsQuery.data ?? []).find((c) => c.id === invoice?.card_id) ?? null;
  const view = invoice
    ? enrichInvoice(invoice, invoiceQuery.data?.summary ?? null, card, company.dias_alerta_vencimento)
    : null;

  const txs = txQuery.data ?? [];
  const filteredTx = txs.filter((t) => {
    const kind = t.charge_kind ?? (t.direction === "saida" ? "compra" : "credito");
    if (kindFilter !== ALL && kind !== kindFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || t.description.toLowerCase().includes(q);
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["invoice", id] }),
      queryClient.invalidateQueries({ queryKey: ["invoice-transactions", id] }),
      queryClient.invalidateQueries({ queryKey: ["invoice-payments", id] }),
      queryClient.invalidateQueries({ queryKey: ["invoices", company.id] }),
      queryClient.invalidateQueries({ queryKey: ["all-invoice-payments", company.id] }),
    ]);
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(friendlyInvoiceError(e));
    }
  }

  async function setLifecycle(status: CardInvoice["status"], ok: string) {
    await run(async () => {
      const { error } = await supabase.from("card_invoices").update({ status }).eq("id", id);
      if (error) throw error;
    }, ok);
  }

  async function setKind(txId: string, kind: ChargeKind) {
    await run(async () => {
      const { error } = await supabase.from("transactions").update({ charge_kind: kind, updated_by: userId }).eq("id", txId);
      if (error) throw error;
    }, "Natureza do lançamento atualizada.");
  }

  if (!canView) {
    return (
      <AppShell title="Fatura">
        <AccessDenied />
      </AppShell>
    );
  }

  if (invoiceQuery.isLoading || cardsQuery.isLoading) {
    return (
      <AppShell title="Fatura">
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AppShell>
    );
  }

  if (!view || !invoice) {
    return (
      <AppShell title="Fatura">
        <EmptyState icon={Wallet} title="Fatura não encontrada" description="A fatura não existe ou pertence a outra empresa." action={<Button asChild size="sm" variant="outline"><Link to="/faturas">Voltar às faturas</Link></Button>} />
      </AppShell>
    );
  }

  const cancelled = invoice.status === "cancelada";
  const s = view.summary;
  const paymentLines = Number(s?.payment_lines ?? 0);

  return (
    <AppShell
      title={`${card?.nickname ?? "Cartão"} ${maskCard(card?.last_four_digits)} — Fatura ${formatCompetence(invoice.competence)}`}
      description={`Período ${formatDate(invoice.period_start)} a ${formatDate(invoice.closing_date)}`}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/faturas"><ArrowLeft className="mr-1.5 h-4 w-4" />Faturas</Link>
        </Button>
      }
    >
      {/* Cabeçalho */}
      <section className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <Info label="Cartão" value={`${card?.nickname ?? "—"} ${maskCard(card?.last_four_digits)}`} />
        <Info label="Competência" value={formatCompetence(invoice.competence)} />
        <Info label="Fechamento" value={formatDate(invoice.closing_date)} />
        <div>
          <p className="text-xs text-muted-foreground">Vencimento</p>
          <p className="tabular flex items-center gap-2 font-medium"><DueDot tone={view.tone} />{formatDate(invoice.due_date)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <InvoiceStatusBadge status={view.displayStatus} />
        </div>
        <Info label="Limite" value={formatBRL(card?.credit_limit ?? null)} />
      </section>

      {(canManage || canPay) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {canPay && !cancelled && view.balance > 0 && (
            <Button size="sm" onClick={() => setPayOpen(true)}><Wallet className="mr-1.5 h-4 w-4" />Registrar pagamento</Button>
          )}
          {canLink && !cancelled && (
            <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}><Link2 className="mr-1.5 h-4 w-4" />Vincular lançamentos</Button>
          )}
          {canManage && invoice.status === "aberta" && (
            <Button size="sm" variant="outline" onClick={() => setLifecycle("fechada", "Fatura fechada.")}>Fechar fatura</Button>
          )}
          {canManage && invoice.status === "fechada" && (
            <Button size="sm" variant="outline" onClick={() => setLifecycle("aberta", "Fatura reaberta.")}>Reabrir</Button>
          )}
          {canManage && !cancelled && (
            <Button size="sm" variant="outline" onClick={() => setDueOpen(true)}>Alterar vencimento</Button>
          )}
          {canManage && !cancelled && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() =>
                setConfirm({
                  title: "Cancelar fatura?",
                  description: view.paid > 0
                    ? "Há pagamentos ativos nesta fatura. Estorne-os antes de cancelar."
                    : "A fatura deixa de compor limites e não aceitará vínculos ou pagamentos. Os lançamentos são preservados.",
                  action: async () => {
                    if (view.paid > 0) return;
                    await setLifecycle("cancelada", "Fatura cancelada.");
                  },
                })
              }
            >
              Cancelar fatura
            </Button>
          )}
          {canManage && cancelled && (
            <Button size="sm" variant="outline" onClick={() => setLifecycle("aberta", "Fatura reativada.")}>Reativar fatura</Button>
          )}
        </div>
      )}

      {/* Resumo */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Compras" value={s?.purchases} />
        <Metric label="Juros" value={s?.interest} />
        <Metric label="Tarifas / encargos" value={Number(s?.fees ?? 0) + Number(s?.charges ?? 0)} />
        <Metric label="Ajustes" value={s?.adjustments} />
        <Metric label="Créditos" value={s?.credits} negative />
        <Metric label="Estornos" value={s?.refunds} negative />
        <Metric label="Total" value={view.total} strong />
        <Metric label="Pago" value={view.paid} />
        <div className="col-span-2 rounded-xl border border-primary/30 bg-accent p-3 sm:col-span-4 lg:col-span-8">
          <p className="text-xs text-accent-foreground/80">Saldo</p>
          <p className="tabular text-2xl font-bold text-accent-foreground">{formatBRL(view.balance)}</p>
        </div>
      </section>

      {paymentLines > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/60 bg-warning/15 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {paymentLines} linha(s) de pagamento vieram no extrato da fatura. Elas não entram no total; registre o pagamento em
          “Pagamentos” para não duplicar.
        </p>
      )}

      {/* Lançamentos */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Lançamentos ({txs.length})</h2>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" aria-label="Pesquisar descrição" placeholder="Pesquisar descrição…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-40" aria-label="Natureza"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas naturezas</SelectItem>
                {Object.entries(CHARGE_KIND_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {filteredTx.length === 0 ? (
          <EmptyState icon={Link2} title="Nenhum lançamento" description="Vincule lançamentos do cartão a esta fatura ou use “Associar lançamentos” no painel." />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Natureza</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Origem</TableHead>
                    {canLink && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTx.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="tabular">{formatDate(t.posted_at)}</TableCell>
                      <TableCell className="max-w-72 truncate">{t.description}</TableCell>
                      <TableCell>{t.transaction_categories?.name ?? "Não classificado"}</TableCell>
                      <TableCell>
                        {canLink && !cancelled ? (
                          <Select value={t.charge_kind ?? (t.direction === "saida" ? "compra" : "credito")} onValueChange={(v) => setKind(t.id, v as ChargeKind)}>
                            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Natureza do lançamento"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(CHARGE_KIND_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          CHARGE_KIND_LABELS[t.charge_kind ?? (t.direction === "saida" ? "compra" : "credito")]
                        )}
                      </TableCell>
                      <TableCell className="tabular">{installmentLabel(t.installment_number, t.installment_total)}</TableCell>
                      <TableCell className={`tabular text-right font-medium ${t.direction === "entrada" ? "text-success" : ""}`}>
                        {t.direction === "entrada" ? "− " : ""}{formatBRL(t.amount)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {ORIGIN_LABELS[t.origin]}
                        {t.import_id && (
                          <Link to="/importacoes/$id" params={{ id: t.import_id }} className="ml-1 text-primary hover:underline">arquivo</Link>
                        )}
                      </TableCell>
                      {canLink && (
                        <TableCell>
                          <Button variant="ghost" size="icon" aria-label="Desvincular" onClick={() => run(() => unlinkTransaction(t.id, userId), "Lançamento desvinculado da fatura.")}>
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="space-y-2 lg:hidden">
              {filteredTx.map((t) => (
                <li key={t.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium">{t.description}</p>
                    <p className={`tabular shrink-0 font-semibold ${t.direction === "entrada" ? "text-success" : ""}`}>
                      {t.direction === "entrada" ? "− " : ""}{formatBRL(t.amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(t.posted_at)} · {CHARGE_KIND_LABELS[t.charge_kind ?? (t.direction === "saida" ? "compra" : "credito")]}
                    {t.installment_number ? ` · Parcela ${installmentLabel(t.installment_number, t.installment_total)}` : ""} · {ORIGIN_LABELS[t.origin]}
                  </p>
                  {canLink && (
                    <Button variant="ghost" size="sm" className="mt-1 h-8 px-2 text-xs" onClick={() => run(() => unlinkTransaction(t.id, userId), "Lançamento desvinculado da fatura.")}>
                      <Unlink className="mr-1 h-3.5 w-3.5" />Desvincular
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Pagamentos */}
      <section>
        <h2 className="mb-3 font-display text-base font-semibold">Pagamentos</h2>
        {(paymentsQuery.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="space-y-2">
            {(paymentsQuery.data ?? []).map((p) => {
              const acc = p.bank_accounts as { nickname: string | null; account_number: string } | null;
              const inactive = p.status !== "ativo";
              return (
                <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-sm ${inactive ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className={`tabular font-semibold ${inactive ? "line-through" : ""}`}>{formatBRL(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.paid_at)} · {acc ? acc.nickname || acc.account_number : "Conta não informada"}
                      {p.bank_transaction_id ? " · vinculado a débito do extrato" : ""}
                      {inactive ? " · Estornado" : ""}
                    </p>
                    {p.notes && <p className="mt-0.5 text-xs">{p.notes}</p>}
                    <p className="text-[11px] text-muted-foreground">Registrado em {formatDateTime(p.created_at)}</p>
                  </div>
                  {canPay && !inactive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() =>
                        setConfirm({
                          title: "Estornar pagamento?",
                          description: "O pagamento fica registrado como estornado (não é excluído) e o saldo da fatura volta a considerar esse valor.",
                          action: async () => {
                            await run(async () => {
                              const { error } = await supabase.from("invoice_payments").update({ status: "inativo" }).eq("id", p.id);
                              if (error) throw error;
                            }, "Pagamento estornado.");
                          },
                        })
                      }
                    >
                      Estornar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canLink && linkOpen && card && (
        <LinkDialog invoice={invoice} card={card} onClose={() => setLinkOpen(false)} userId={userId} onDone={refresh} />
      )}
      {canPay && payOpen && (
        <PaymentDialog invoice={invoice} balance={view.balance} companyId={company.id} defaultAccountId={card?.account_id ?? null} userId={userId} onClose={() => setPayOpen(false)} onDone={refresh} />
      )}
      {canManage && dueOpen && (
        <DueDialog invoice={invoice} onClose={() => setDueOpen(false)} onDone={refresh} />
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        onConfirm={async () => {
          await confirm?.action();
          setConfirm(null);
        }}
      />
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular truncate font-medium">{value}</p>
    </div>
  );
}

function Metric({ label, value, negative, strong }: { label: string; value: number | string | null | undefined; negative?: boolean; strong?: boolean }) {
  const n = Number(value ?? 0);
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular ${strong ? "text-lg font-bold" : "font-semibold"} ${negative && n > 0 ? "text-success" : ""}`}>
        {negative && n > 0 ? "− " : ""}{formatBRL(n)}
      </p>
    </div>
  );
}

function LinkDialog({
  invoice,
  card,
  onClose,
  userId,
  onDone,
}: {
  invoice: CardInvoice;
  card: { id: string; closing_day: number | null; due_day: number | null };
  onClose: () => void;
  userId: string | null;
  onDone: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["unlinked-card-tx", card.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, posted_at, description, amount, direction")
        .eq("card_id", card.id)
        .eq("status", "ativo")
        .is("invoice_id", null)
        .order("posted_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = useMemo(
    () =>
      (data ?? []).map((t) => {
        let suggested = false;
        if (t.posted_at && card.closing_day && card.due_day) {
          suggested = cycleForPurchase(t.posted_at, card.closing_day, card.due_day).competence === invoice.competence;
        }
        return { ...t, suggested };
      }).sort((a, b) => Number(b.suggested) - Number(a.suggested)),
    [data, card, invoice.competence],
  );

  async function save() {
    setSaving(true);
    try {
      const n = await linkTransactions(invoice, [...selected], userId);
      toast.success(`${n} lançamento(s) vinculado(s).`);
      await onDone();
      onClose();
    } catch (e) {
      toast.error(friendlyInvoiceError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Vincular lançamentos do cartão</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Lançamentos do cartão ainda sem fatura. Os marcados como “sugerido” têm data de compra dentro do período desta fatura.
          O vínculo não duplica o lançamento.
        </p>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lançamento pendente de vínculo.</p>
          ) : (
            rows.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={selected.has(t.id)}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v) next.add(t.id);
                    else next.delete(t.id);
                    setSelected(next);
                  }}
                />
                <span className="tabular w-20 shrink-0 text-xs">{formatDate(t.posted_at)}</span>
                <span className="min-w-0 flex-1 truncate">{t.description}</span>
                {t.suggested && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">sugerido</span>}
                <span className={`tabular shrink-0 ${t.direction === "entrada" ? "text-success" : ""}`}>{formatBRL(t.amount)}</span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSelected(new Set(rows.filter((r) => r.suggested).map((r) => r.id)))}>Selecionar sugeridos</Button>
          <Button onClick={save} disabled={saving || selected.size === 0}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Vincular {selected.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  invoice,
  balance,
  companyId,
  defaultAccountId,
  userId,
  onClose,
  onDone,
}: {
  invoice: CardInvoice;
  balance: number;
  companyId: string;
  defaultAccountId: string | null;
  userId: string | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    paidAt: todayIso(),
    amount: balance.toFixed(2).replace(".", ","),
    accountId: defaultAccountId ?? "",
    notes: "",
  });
  const [bankTxId, setBankTxId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amount = parseBRL(form.amount);

  const { data: accounts } = useQuery({
    queryKey: ["accounts-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, nickname, account_number")
        .eq("company_id", companyId)
        .eq("status", "ativo")
        .order("nickname");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: matches } = useQuery({
    queryKey: ["possible-bank-payment", form.accountId, form.paidAt, amount],
    enabled: !!form.accountId && !!form.paidAt && amount !== null && amount > 0,
    queryFn: () => findPossibleBankPayments(companyId, form.accountId, form.paidAt, amount!),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (amount === null || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setSaving(true);
    try {
      const r = await registerPayment({
        invoice,
        paidAt: form.paidAt,
        amount,
        accountId: form.accountId || null,
        bankTransactionId: bankTxId,
        notes: form.notes.trim() || null,
        idempotencyKey,
        userId,
      });
      toast.success(r.duplicate ? "Este pagamento já havia sido registrado." : amount < balance ? "Pagamento parcial registrado." : "Pagamento registrado.");
      await onDone();
      onClose();
    } catch (err) {
      toast.error(friendlyInvoiceError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar pagamento — {formatCompetence(invoice.competence)}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-muted-foreground">Saldo atual: <strong className="tabular">{formatBRL(balance)}</strong></p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Data</Label>
              <Input id="pay-date" type="date" required value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Valor</Label>
              <Input id="pay-amount" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Conta bancária utilizada</Label>
            <Select value={form.accountId} onValueChange={(v) => { setForm({ ...form, accountId: v }); setBankTxId(null); }}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.nickname || a.account_number}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(matches ?? []).length > 0 && (
            <div className="rounded-lg border border-warning/60 bg-warning/15 p-3 text-sm text-warning-foreground">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Possível pagamento já existente — revisar vínculo</p>
              <p className="mt-1 text-xs">Débito(s) de mesmo valor já importado(s) no extrato desta conta. Nada é excluído ou conciliado automaticamente.</p>
              <div className="mt-2 space-y-1">
                {(matches ?? []).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={bankTxId === m.id} onCheckedChange={(v) => setBankTxId(v ? m.id : null)} />
                    Vincular a: {formatDate(m.posted_at)} · {m.description} · {formatBRL(m.amount)}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Observação</Label>
            <Textarea id="pay-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">Responsável: usuário atual (registrado automaticamente na auditoria).</p>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DueDialog({ invoice, onClose, onDone }: { invoice: CardInvoice; onClose: () => void; onDone: () => Promise<void> }) {
  const [due, setDue] = useState(invoice.due_date);
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (due < invoice.closing_date) {
      toast.error("O vencimento não pode ser anterior ao fechamento.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("card_invoices").update({ due_date: due }).eq("id", invoice.id);
    setSaving(false);
    if (error) {
      toast.error(friendlyInvoiceError(error));
      return;
    }
    toast.success("Vencimento alterado.");
    await onDone();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Alterar vencimento</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="due">Novo vencimento</Label>
            <Input id="due" type="date" required min={invoice.closing_date} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
