import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, FileText, Layers, Link2, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { AccessDenied, AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { DueDot, InvoiceStatusBadge } from "@/components/invoice-ui";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/lib/backend-client";
import { APP_NAME, type Company } from "@/lib/domain";
import { formatBRL, formatDate, maskCard, parseBRL } from "@/lib/format";
import {
  computeLimits,
  cycleForPurchase,
  formatCompetence,
  INVOICE_STATUS_LABELS,
  todayIso,
  type InvoiceDisplayStatus,
} from "@/lib/invoices";
import {
  autoAssignCardTransactions,
  cardHasCycle,
  createInstallmentPurchase,
  ensureInvoiceForCompetence,
  friendlyInvoiceError,
} from "@/lib/invoice-service";
import { enrichInvoice, useInvoiceCards, useInvoices, type InvoiceCard, type InvoiceView } from "@/lib/use-invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/faturas/")({
  head: () => ({
    meta: [
      { title: `Faturas de cartão — ${APP_NAME}` },
      { name: "description", content: "Painel de cartões e faturas: limites, fechamento, vencimento e status." },
      { property: "og:title", content: `Faturas de cartão — ${APP_NAME}` },
      { property: "og:description", content: "Controle de faturas por cartão e competência." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicesPage,
});

const ALL = "__all__";

function InvoicesPage() {
  return <RequireCompany>{({ company }) => <InvoicesContent company={company} />}</RequireCompany>;
}

function InvoicesContent({ company }: { company: Company }) {
  const { user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const canView = hasPermission("invoice.view");
  const canManage = hasPermission("invoice.manage") && hasPermission("transaction.manage");

  const cardsQuery = useInvoiceCards(company.id);
  const invoicesQuery = useInvoices(company.id);
  const [filters, setFilters] = useState({
    institution: ALL,
    card: ALL,
    competence: "",
    dueMonth: "",
    status: ALL,
    search: "",
  });
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [instOpen, setInstOpen] = useState(false);

  const today = todayIso();
  const cards = cardsQuery.data ?? [];
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const invoices: InvoiceView[] = useMemo(
    () =>
      (invoicesQuery.data ?? []).map(({ invoice, summary }) =>
        enrichInvoice(invoice, summary, cardById.get(invoice.card_id) ?? null, company.dias_alerta_vencimento, today),
      ),
    [invoicesQuery.data, cardById, company.dias_alerta_vencimento, today],
  );

  const institutions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) if (c.institution_id) m.set(c.institution_id, c.financial_institutions?.name ?? "—");
    return [...m.entries()];
  }, [cards]);

  const filtered = invoices.filter((i) => {
    if (filters.card !== ALL && i.card_id !== filters.card) return false;
    if (filters.institution !== ALL && i.card?.institution_id !== filters.institution) return false;
    if (filters.competence && !i.competence.startsWith(filters.competence)) return false;
    if (filters.dueMonth && !i.due_date.startsWith(filters.dueMonth)) return false;
    if (filters.status !== ALL && i.displayStatus !== filters.status) return false;
    const q = filters.search.trim().toLowerCase();
    if (q && !`${i.card?.nickname ?? ""} ${i.card?.last_four_digits ?? ""} ${formatCompetence(i.competence)}`.toLowerCase().includes(q))
      return false;
    return true;
  });

  // Painel: fatura atual = fatura cujo ciclo contém hoje; limite = total − saldos em aberto.
  const panel = cards
    .filter((c) => c.status === "ativo" && c.type !== "debito")
    .map((card) => {
      const cardInvoices = invoices.filter((i) => i.card_id === card.id && i.displayStatus !== "cancelada");
      const currentCompetence = cardHasCycle(card) ? cycleForPurchase(today, card.closing_day!, card.due_day!).competence : null;
      const current =
        cardInvoices.find((i) => i.competence === currentCompetence) ??
        cardInvoices.find((i) => i.displayStatus !== "paga") ??
        null;
      const limits = computeLimits(
        card.credit_limit === null ? null : Number(card.credit_limit),
        cardInvoices.map((i) => i.balance),
      );
      return { card, current, limits, currentCompetence };
    });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["invoices", company.id] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    ]);
  }

  async function assign(card: InvoiceCard) {
    setBusyCard(card.id);
    try {
      const r = await autoAssignCardTransactions(card, user?.id ?? null);
      const extras = [
        r.skippedNoDate ? `${r.skippedNoDate} sem data` : "",
        r.skippedCancelled ? `${r.skippedCancelled} em fatura cancelada` : "",
      ].filter(Boolean);
      toast.success(
        r.linked === 0
          ? "Nenhum lançamento pendente de associação."
          : `${r.linked} lançamento(s) associado(s) às faturas${extras.length ? ` (${extras.join(", ")} não associados)` : ""}.`,
      );
      await refresh();
    } catch (e) {
      toast.error(friendlyInvoiceError(e));
    } finally {
      setBusyCard(null);
    }
  }

  if (!canView) {
    return (
      <AppShell title="Faturas">
        <AccessDenied />
      </AppShell>
    );
  }

  const loading = cardsQuery.isLoading || invoicesQuery.isLoading;

  return (
    <AppShell
      title="Faturas"
      description={`Cartões e faturas de ${company.name}`}
      actions={
        canManage ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setInstOpen(true)}>
              <Layers className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Compra parcelada</span>
              <span className="sm:hidden">Parcelada</span>
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Fatura
            </Button>
          </>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <section aria-labelledby="painel-cartoes" className="mb-8">
            <h2 id="painel-cartoes" className="mb-3 font-display text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Painel de cartões
            </h2>
            {panel.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Nenhum cartão de crédito ativo"
                description="Cadastre um cartão com dia de fechamento e vencimento para controlar faturas."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {panel.map(({ card, current, limits }) => (
                  <article key={card.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{card.nickname}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {maskCard(card.last_four_digits)} · {card.financial_institutions?.name ?? "—"}
                        </p>
                      </div>
                      {current ? <InvoiceStatusBadge status={current.displayStatus} /> : null}
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Limite</dt>
                        <dd className="tabular font-medium">{formatBRL(limits.total)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Utilizado</dt>
                        <dd className="tabular font-medium">{formatBRL(limits.used)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Disponível</dt>
                        <dd className={`tabular font-medium ${limits.available !== null && limits.available < 0 ? "text-destructive" : ""}`}>
                          {formatBRL(limits.available)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs">
                      {!cardHasCycle(card) ? (
                        <p className="text-muted-foreground">Informe dia de fechamento e vencimento no cadastro do cartão.</p>
                      ) : current ? (
                        <Link to="/faturas/$id" params={{ id: current.id }} className="block hover:underline">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Fatura {formatCompetence(current.competence)}</span>
                            <span className="tabular text-sm font-semibold">{formatBRL(current.total)}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                            <DueDot tone={current.tone} />
                            Fecha {formatDate(current.closing_date)} · Vence {formatDate(current.due_date)}
                          </div>
                        </Link>
                      ) : (
                        <p className="text-muted-foreground">
                          Fechamento dia {card.closing_day} · vencimento dia {card.due_day}. Nenhuma fatura ainda.
                        </p>
                      )}
                    </div>
                    {canManage && cardHasCycle(card) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 w-full"
                        disabled={busyCard === card.id}
                        onClick={() => assign(card)}
                      >
                        {busyCard === card.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
                        Associar lançamentos às faturas
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Disponível = limite total − saldos em aberto das faturas (inclui parcelas futuras lançadas). Não são
              aplicadas regras específicas de recomposição de limite de cada banco.
            </p>
          </section>

          <section aria-labelledby="lista-faturas">
            <h2 id="lista-faturas" className="mb-3 font-display text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Faturas
            </h2>
            <div className="mb-4 grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="relative lg:col-span-2">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  aria-label="Pesquisar"
                  placeholder="Cartão, final ou competência…"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <Select value={filters.institution} onValueChange={(v) => setFilters({ ...filters, institution: v })}>
                <SelectTrigger aria-label="Instituição"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as instituições</SelectItem>
                  {institutions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.card} onValueChange={(v) => setFilters({ ...filters, card: v })}>
                <SelectTrigger aria-label="Cartão"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os cartões</SelectItem>
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nickname} {maskCard(c.last_four_digits)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os status</SelectItem>
                  {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-6 lg:max-w-md">
                <div className="space-y-1">
                  <Label htmlFor="f-comp" className="text-xs">Competência</Label>
                  <Input id="f-comp" type="month" value={filters.competence} onChange={(e) => setFilters({ ...filters, competence: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="f-due" className="text-xs">Mês de vencimento</Label>
                  <Input id="f-due" type="month" value={filters.dueMonth} onChange={(e) => setFilters({ ...filters, dueMonth: e.target.value })} />
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nenhuma fatura encontrada"
                description="Associe os lançamentos de cartão às faturas pelo painel acima ou crie uma fatura por competência."
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cartão</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead>Fechamento</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Pago</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>
                            <Link to="/faturas/$id" params={{ id: i.id }} className="font-medium hover:underline">
                              {i.card?.nickname ?? "—"}
                            </Link>
                            <p className="tabular text-xs text-muted-foreground">{maskCard(i.card?.last_four_digits)}</p>
                          </TableCell>
                          <TableCell className="tabular">{formatCompetence(i.competence)}</TableCell>
                          <TableCell className="tabular">{formatDate(i.closing_date)}</TableCell>
                          <TableCell className="tabular">
                            <span className="inline-flex items-center gap-2"><DueDot tone={i.tone} />{formatDate(i.due_date)}</span>
                          </TableCell>
                          <TableCell className="tabular text-right">{formatBRL(i.total)}</TableCell>
                          <TableCell className="tabular text-right">{formatBRL(i.paid)}</TableCell>
                          <TableCell className="tabular text-right font-medium">{formatBRL(i.balance)}</TableCell>
                          <TableCell><InvoiceStatusBadge status={i.displayStatus} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="space-y-3 lg:hidden">
                  {filtered.map((i) => (
                    <li key={i.id}>
                      <Link to="/faturas/$id" params={{ id: i.id }} className="block rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{i.card?.nickname ?? "—"} · {formatCompetence(i.competence)}</p>
                            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <DueDot tone={i.tone} /> Vence {formatDate(i.due_date)}
                            </p>
                          </div>
                          <InvoiceStatusBadge status={i.displayStatus} />
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <span className="text-xs text-muted-foreground">Saldo {formatBRL(i.balance)}</span>
                          <span className="tabular text-lg font-semibold">{formatBRL(i.total)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {canManage && (
        <NewInvoiceDialog open={newOpen} onOpenChange={setNewOpen} cards={cards} userId={user?.id ?? null} onDone={refresh} />
      )}
      {canManage && (
        <InstallmentDialog
          open={instOpen}
          onOpenChange={setInstOpen}
          cards={cards}
          companyId={company.id}
          userId={user?.id ?? null}
          onDone={refresh}
        />
      )}
    </AppShell>
  );
}

function NewInvoiceDialog({
  open,
  onOpenChange,
  cards,
  userId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cards: InvoiceCard[];
  userId: string | null;
  onDone: () => Promise<void>;
}) {
  const eligible = cards.filter((c) => c.status === "ativo" && cardHasCycle(c));
  const [cardId, setCardId] = useState("");
  const [competence, setCompetence] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const card = eligible.find((c) => c.id === cardId);
    if (!card || !competence) return;
    setSaving(true);
    try {
      const inv = await ensureInvoiceForCompetence(card, competence, userId);
      toast.success(`Fatura ${formatCompetence(inv.competence)} disponível (vence ${formatDate(inv.due_date)}).`);
      await onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyInvoiceError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova fatura</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cartão</Label>
            <Select value={cardId} onValueChange={setCardId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {eligible.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nickname} {maskCard(c.last_four_digits)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nf-comp">Competência (mês de vencimento)</Label>
            <Input id="nf-comp" type="month" required value={competence} onChange={(e) => setCompetence(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Datas de fechamento e vencimento são calculadas pelo cadastro do cartão. Se a fatura já existir, ela é reaproveitada.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !cardId || !competence}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InstallmentDialog({
  open,
  onOpenChange,
  cards,
  companyId,
  userId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cards: InvoiceCard[];
  companyId: string;
  userId: string | null;
  onDone: () => Promise<void>;
}) {
  const eligible = cards.filter((c) => c.status === "ativo" && cardHasCycle(c) && c.type !== "debito");
  const [form, setForm] = useState({ cardId: "", description: "", total: "", count: "2", date: "", categoryId: "" });
  const [groupId, setGroupId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories-active", companyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_categories")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const card = eligible.find((c) => c.id === form.cardId);
  const preview =
    card && form.date ? cycleForPurchase(form.date, card.closing_day!, card.due_day!) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;
    const total = parseBRL(form.total);
    if (total === null || total <= 0) {
      toast.error("Valor total inválido. Use o formato 1.234,56.");
      return;
    }
    setSaving(true);
    try {
      const r = await createInstallmentPurchase({
        card,
        description: form.description,
        totalAmount: total,
        count: Number(form.count),
        purchaseDate: form.date,
        categoryId: form.categoryId || null,
        groupId,
        userId,
      });
      const notes = [
        r.alreadyImported.length ? `parcelas já importadas mantidas: ${r.alreadyImported.join(", ")}` : "",
        r.alreadyCreated ? `${r.alreadyCreated} já registrada(s) anteriormente` : "",
      ].filter(Boolean);
      toast.success(`${r.created} parcela(s) lançada(s)${notes.length ? ` — ${notes.join("; ")}` : ""}.`);
      await onDone();
      setGroupId(crypto.randomUUID());
      setForm({ cardId: "", description: "", total: "", count: "2", date: "", categoryId: "" });
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyInvoiceError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Compra parcelada</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cartão</Label>
            <Select value={form.cardId} onValueChange={(v) => setForm({ ...form, cardId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {eligible.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nickname} {maskCard(c.last_four_digits)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ip-desc">Descrição</Label>
            <Input id="ip-desc" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Notebook" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ip-total">Valor total</Label>
              <Input id="ip-total" required inputMode="decimal" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-count">Parcelas</Label>
              <Input id="ip-count" required type="number" min={2} max={99} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-date">Data da compra</Label>
              <Input id="ip-date" required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preview && (
            <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              Primeira parcela na fatura <strong>{formatCompetence(preview.competence)}</strong> (fecha{" "}
              {formatDate(preview.closingDate)}, vence {formatDate(preview.dueDate)}). Cada parcela seguinte vai para a fatura
              do mês seguinte. Parcelas já importadas com a mesma descrição não são recriadas.
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving || !card}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Lançar parcelas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type { InvoiceDisplayStatus };
