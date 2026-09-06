import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, ReceiptText, Search } from "lucide-react";
import { toast } from "sonner";

import { AccessDenied, AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/lib/backend-client";
import {
  APP_NAME,
  DIRECTION_LABELS,
  ORIGIN_LABELS,
  type Company,
  type Transaction,
  type TransactionDirection,
} from "@/lib/domain";
import { formatBRL, formatDate, parseBRL } from "@/lib/format";
import { UNCLASSIFIED_LABEL } from "@/lib/importers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({
    meta: [
      { title: `Lançamentos — ${APP_NAME}` },
      {
        name: "description",
        content:
          "Consulte, filtre e totalize os lançamentos importados e manuais da empresa selecionada.",
      },
      { property: "og:title", content: `Lançamentos — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Central de lançamentos com filtros por período, conta, cartão e categoria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

const ALL = "__all__";
const NO_CATEGORY = "__none__";

function TransactionsPage() {
  return (
    <RequireCompany>{({ company }) => <TransactionsContent company={company} />}</RequireCompany>
  );
}

type Filters = {
  start: string;
  end: string;
  institutionId: string;
  accountId: string;
  cardId: string;
  categoryId: string;
  direction: string;
  origin: string;
  search: string;
};

const EMPTY_FILTERS: Filters = {
  start: "",
  end: "",
  institutionId: ALL,
  accountId: ALL,
  cardId: ALL,
  categoryId: ALL,
  direction: ALL,
  origin: ALL,
  search: "",
};

function TransactionsContent({ company }: { company: Company }) {
  const { user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [removing, setRemoving] = useState<Transaction | null>(null);

  const canView = hasPermission("transaction.view");
  const canManage = hasPermission("transaction.manage");

  const { data: institutions } = useQuery({
    queryKey: ["institutions", company.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_institutions")
        .select("id, name")
        .eq("company_id", company.id)
        .order("name");
      return data ?? [];
    },
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts-min", company.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, nickname, account_number, institution_id")
        .eq("company_id", company.id);
      return data ?? [];
    },
  });
  const { data: cards } = useQuery({
    queryKey: ["cards-min", company.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("cards")
        .select("id, nickname, last_four_digits, institution_id")
        .eq("company_id", company.id);
      return data ?? [];
    },
  });
  const { data: categories } = useQuery({
    queryKey: ["categories-min", company.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transaction_categories")
        .select("id, name")
        .eq("company_id", company.id)
        .eq("status", "ativo")
        .order("name");
      return data ?? [];
    },
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", company.id, filters],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*")
        .eq("company_id", company.id)
        .eq("status", "ativo")
        .order("posted_at", { ascending: false })
        .limit(1000);
      if (filters.start) q = q.gte("posted_at", filters.start);
      if (filters.end) q = q.lte("posted_at", filters.end);
      if (filters.institutionId !== ALL) q = q.eq("institution_id", filters.institutionId);
      if (filters.accountId !== ALL) q = q.eq("account_id", filters.accountId);
      if (filters.cardId !== ALL) q = q.eq("card_id", filters.cardId);
      if (filters.categoryId === NO_CATEGORY) q = q.is("category_id", null);
      else if (filters.categoryId !== ALL) q = q.eq("category_id", filters.categoryId);
      if (filters.direction !== ALL)
        q = q.eq("direction", filters.direction as TransactionDirection);
      if (filters.origin !== ALL) q = q.eq("origin", filters.origin as "importado" | "manual");
      if (filters.search.trim())
        q = q.ilike("description", `%${filters.search.trim().replace(/[%_]/g, "")}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
    enabled: canView,
  });

  const rows = transactions ?? [];

  const totals = useMemo(() => {
    let entrada = 0;
    let saida = 0;
    const byCategory = new Map<string, { entrada: number; saida: number }>();
    for (const t of rows) {
      const value = Number(t.amount);
      const key = t.category_id ?? NO_CATEGORY;
      const bucket = byCategory.get(key) ?? { entrada: 0, saida: 0 };
      if (t.direction === "entrada") {
        entrada += value;
        bucket.entrada += value;
      } else {
        saida += value;
        bucket.saida += value;
      }
      byCategory.set(key, bucket);
    }
    return { entrada, saida, saldo: entrada - saida, byCategory: [...byCategory.entries()] };
  }, [rows]);

  const categoryName = (id: string | null) =>
    (categories ?? []).find((c) => c.id === id)?.name ?? UNCLASSIFIED_LABEL;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["transactions", company.id] });
  }

  if (!canView) {
    return (
      <AppShell title="Lançamentos">
        <AccessDenied />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Lançamentos"
      description="Movimentações importadas e manuais da empresa"
      actions={
        canManage ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo lançamento
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Entradas" value={formatBRL(totals.entrada)} />
          <SummaryCard label="Saídas" value={formatBRL(totals.saida)} />
          <SummaryCard label="Saldo" value={formatBRL(totals.saldo)} />
        </div>

        {/* Filtros */}
        <div className="rounded-lg border border-border bg-card">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            Filtros
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          <div className={`${filtersOpen ? "block" : "hidden"} p-4 pt-0 lg:block lg:pt-4`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="De">
                <Input
                  type="date"
                  value={filters.start}
                  onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
                />
              </Field>
              <Field label="Até">
                <Input
                  type="date"
                  value={filters.end}
                  onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
                />
              </Field>
              <Field label="Instituição">
                <FilterSelect
                  value={filters.institutionId}
                  onChange={(v) => setFilters((f) => ({ ...f, institutionId: v }))}
                  options={(institutions ?? []).map((i) => ({ value: i.id, label: i.name }))}
                />
              </Field>
              <Field label="Conta">
                <FilterSelect
                  value={filters.accountId}
                  onChange={(v) => setFilters((f) => ({ ...f, accountId: v }))}
                  options={(accounts ?? []).map((a) => ({
                    value: a.id,
                    label: a.nickname || a.account_number,
                  }))}
                />
              </Field>
              <Field label="Cartão">
                <FilterSelect
                  value={filters.cardId}
                  onChange={(v) => setFilters((f) => ({ ...f, cardId: v }))}
                  options={(cards ?? []).map((c) => ({ value: c.id, label: c.nickname }))}
                />
              </Field>
              <Field label="Categoria">
                <FilterSelect
                  value={filters.categoryId}
                  onChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))}
                  options={[
                    { value: NO_CATEGORY, label: UNCLASSIFIED_LABEL },
                    ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Field>
              <Field label="Natureza">
                <FilterSelect
                  value={filters.direction}
                  onChange={(v) => setFilters((f) => ({ ...f, direction: v }))}
                  options={[
                    { value: "entrada", label: "Entrada" },
                    { value: "saida", label: "Saída" },
                  ]}
                />
              </Field>
              <Field label="Origem">
                <FilterSelect
                  value={filters.origin}
                  onChange={(v) => setFilters((f) => ({ ...f, origin: v }))}
                  options={[
                    { value: "importado", label: "Importado" },
                    { value: "manual", label: "Manual" },
                  ]}
                />
              </Field>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Buscar na descrição">
                  <div className="relative">
                    <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      value={filters.search}
                      onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                      placeholder="Ex.: fornecedor, tarifa..."
                    />
                  </div>
                </Field>
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Limpar filtros
                </Button>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Nenhum lançamento encontrado"
            description="Ajuste os filtros ou importe um extrato para começar."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Natureza</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {canManage && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatDate(t.posted_at)}</TableCell>
                      <TableCell className="max-w-[24rem] truncate">{t.description}</TableCell>
                      <TableCell>{categoryName(t.category_id)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ORIGIN_LABELS[t.origin]}
                      </TableCell>
                      <TableCell>{DIRECTION_LABELS[t.direction]}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${t.direction === "saida" ? "text-destructive" : "text-primary"}`}
                      >
                        {t.direction === "saida" ? "-" : "+"}
                        {formatBRL(Number(t.amount))}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(t)}>
                            Inativar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {rows.map((t) => (
                <li key={t.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.posted_at)} · {categoryName(t.category_id)} ·{" "}
                        {ORIGIN_LABELS[t.origin]}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold tabular-nums ${t.direction === "saida" ? "text-destructive" : "text-primary"}`}
                    >
                      {t.direction === "saida" ? "-" : "+"}
                      {formatBRL(Number(t.amount))}
                    </p>
                  </div>
                  {canManage && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(t)}>
                        Inativar
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-display text-sm font-semibold">Resumo por categoria</p>
              <div className="mt-3 space-y-2">
                {totals.byCategory.map(([key, v]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">
                      {key === NO_CATEGORY ? UNCLASSIFIED_LABEL : categoryName(key)}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      +{formatBRL(v.entrada)} / -{formatBRL(v.saida)} ={" "}
                      <strong className="text-foreground">{formatBRL(v.entrada - v.saida)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {canManage && editing && (
        <TransactionDialog
          company={company}
          userId={user?.id ?? null}
          transaction={editing === "new" ? null : editing}
          categories={categories ?? []}
          accounts={accounts ?? []}
          cards={cards ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      {canManage && removing && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setRemoving(null)}
          title="Inativar lançamento"
          description="O lançamento deixa de ser considerado nos totais, mas permanece registrado para auditoria."
          confirmLabel="Inativar"
          onConfirm={async () => {
            const { error } = await supabase
              .from("transactions")
              .update({ status: "inativo", updated_by: user?.id ?? null })
              .eq("id", removing.id);
            setRemoving(null);
            if (error) return toast.error(`Não foi possível inativar: ${error.message}`);
            toast.success("Lançamento inativado.");
            await refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TransactionDialog({
  company,
  userId,
  transaction,
  categories,
  accounts,
  cards,
  onClose,
  onSaved,
}: {
  company: Company;
  userId: string | null;
  transaction: Transaction | null;
  categories: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; nickname: string | null; account_number: string; institution_id: string }>;
  cards: Array<{ id: string; nickname: string; institution_id: string | null }>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [postedAt, setPostedAt] = useState(transaction?.posted_at ?? "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [direction, setDirection] = useState<TransactionDirection>(
    transaction?.direction ?? "saida",
  );
  const [sourceType, setSourceType] = useState<"conta" | "cartao">(
    transaction?.source_type ?? "conta",
  );
  const [targetId, setTargetId] = useState(
    transaction?.account_id ?? transaction?.card_id ?? "",
  );
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? NO_CATEGORY);
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const targets =
    sourceType === "conta"
      ? accounts.map((a) => ({
          id: a.id,
          label: a.nickname || a.account_number,
          institutionId: a.institution_id,
        }))
      : cards.map((c) => ({ id: c.id, label: c.nickname, institutionId: c.institution_id }));

  async function save() {
    const parsedAmount = parseBRL(amount);
    if (!postedAt) return toast.error("Informe a data do lançamento.");
    if (!description.trim()) return toast.error("Informe a descrição do lançamento.");
    if (parsedAmount === null || parsedAmount === 0)
      return toast.error("Informe um valor válido maior que zero (ex.: 1.234,56).");
    if (!targetId) return toast.error("Selecione a conta ou o cartão do lançamento.");

    const target = targets.find((t) => t.id === targetId);
    const normalized = description
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    setBusy(true);
    const payload = {
      company_id: company.id,
      source_type: sourceType,
      institution_id: target?.institutionId ?? null,
      account_id: sourceType === "conta" ? targetId : null,
      card_id: sourceType === "cartao" ? targetId : null,
      posted_at: postedAt,
      description: description.trim(),
      normalized_description: normalized,
      amount: parsedAmount,
      direction,
      category_id: categoryId === NO_CATEGORY ? null : categoryId,
      notes: notes.trim() || null,
    };

    const { error } = transaction
      ? await supabase
          .from("transactions")
          .update({ ...payload, updated_by: userId })
          .eq("id", transaction.id)
      : await supabase
          .from("transactions")
          .insert({ ...payload, origin: "manual", created_by: userId });
    setBusy(false);
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`);
    toast.success(transaction ? "Lançamento atualizado." : "Lançamento criado.");
    await onSaved();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transaction ? "Editar lançamento" : "Novo lançamento manual"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {transaction && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Origem: {ORIGIN_LABELS[transaction.origin]}
              {transaction.import_id ? " · vinculado a um arquivo importado" : ""}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-date">Data</Label>
              <Input
                id="t-date"
                type="date"
                value={postedAt}
                onChange={(e) => setPostedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-amount">Valor</Label>
              <Input
                id="t-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1.234,56"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Descrição</Label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Natureza</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as TransactionDirection)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>{UNCLASSIFIED_LABEL}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Origem do valor</Label>
              <Select
                value={sourceType}
                onValueChange={(v) => {
                  setSourceType(v as "conta" | "cartao");
                  setTargetId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conta">Conta bancária</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{sourceType === "conta" ? "Conta" : "Cartão"}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-notes">Observações</Label>
            <Input id="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
