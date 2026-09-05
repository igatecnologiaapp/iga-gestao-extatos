import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AccessDenied, AppShell, RequireCompany } from "@/components/app-shell";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/lib/backend-client";
import {
  APP_NAME,
  DIRECTION_LABELS,
  IMPORT_FORMAT_LABELS,
  IMPORT_SOURCE_LABELS,
  IMPORT_STATUS_LABELS,
  type Company,
  type ImportBatch,
  type StagedTransaction,
  type TransactionDirection,
} from "@/lib/domain";
import { formatBRL, formatDate, parseBRL } from "@/lib/format";
import { UNCLASSIFIED_LABEL } from "@/lib/importers";
import { confirmStaged, signedDocumentUrl } from "@/lib/import-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/importacoes/$id")({
  head: () => ({
    meta: [
      { title: `Revisão da importação — ${APP_NAME}` },
      {
        name: "description",
        content: "Revise, classifique e confirme os lançamentos extraídos do arquivo importado.",
      },
      { property: "og:title", content: `Revisão da importação — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Conferência obrigatória antes de confirmar os lançamentos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

const NO_CATEGORY = "__none__";

function ReviewPage() {
  return <RequireCompany>{({ company }) => <ReviewContent company={company} />}</RequireCompany>;
}

function ReviewContent({ company }: { company: Company }) {
  const { id } = Route.useParams();
  const { user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<StagedTransaction | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const canImport = hasPermission("import.execute");

  const { data: batch, isLoading: loadingBatch } = useQuery({
    queryKey: ["import", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as ImportBatch | null;
    },
  });

  const { data: staged, isLoading: loadingRows } = useQuery({
    queryKey: ["staged", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staged_transactions")
        .select("*")
        .eq("import_id", id)
        .order("row_index");
      if (error) throw error;
      return (data ?? []) as StagedTransaction[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories-min", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_categories")
        .select("id, name")
        .eq("company_id", company.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subcategories } = useQuery({
    queryKey: ["subcategories-min", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_subcategories")
        .select("id, name, category_id")
        .eq("company_id", company.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pending = useMemo(
    () => (staged ?? []).filter((s) => s.status === "pendente"),
    [staged],
  );
  const summary = useMemo(() => {
    let entrada = 0;
    let saida = 0;
    let incomplete = 0;
    let duplicates = 0;
    for (const s of pending) {
      if (s.amount === null || !s.direction || !s.posted_at) incomplete += 1;
      if (s.duplicate_state === "possivel") duplicates += 1;
      if (s.amount !== null && s.direction === "entrada") entrada += Number(s.amount);
      if (s.amount !== null && s.direction === "saida") saida += Number(s.amount);
    }
    return { entrada, saida, saldo: entrada - saida, incomplete, duplicates };
  }, [pending]);

  const categoryName = (categoryId: string | null) =>
    (categories ?? []).find((c) => c.id === categoryId)?.name ?? UNCLASSIFIED_LABEL;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staged", id] }),
      queryClient.invalidateQueries({ queryKey: ["import", id] }),
      queryClient.invalidateQueries({ queryKey: ["imports", company.id] }),
      queryClient.invalidateQueries({ queryKey: ["transactions", company.id] }),
    ]);
  }

  async function applyBulkCategory() {
    if (selected.size === 0 || !bulkCategory) return;
    setBusy(true);
    const { error } = await supabase
      .from("staged_transactions")
      .update({
        category_id: bulkCategory === NO_CATEGORY ? null : bulkCategory,
        subcategory_id: null,
      })
      .in("id", [...selected]);
    setBusy(false);
    if (error) return toast.error(`Não foi possível classificar: ${error.message}`);
    toast.success(`${selected.size} lançamento(s) classificado(s).`);
    await refresh();
  }

  async function discardSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    const { error } = await supabase
      .from("staged_transactions")
      .update({ status: "descartado" })
      .in("id", [...selected]);
    setBusy(false);
    if (error) return toast.error(`Não foi possível descartar: ${error.message}`);
    setSelected(new Set());
    toast.success("Lançamentos descartados desta revisão.");
    await refresh();
  }

  async function confirm(rows: StagedTransaction[]) {
    if (!batch) return;
    setBusy(true);
    try {
      const { confirmed } = await confirmStaged({ batch, staged: rows, userId: user?.id ?? null });
      setSelected(new Set());
      toast.success(`${confirmed} lançamento(s) confirmado(s).`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao confirmar os lançamentos.");
    } finally {
      setBusy(false);
    }
  }

  if (loadingBatch || loadingRows) {
    return (
      <AppShell title="Revisão da importação">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!batch) {
    return (
      <AppShell title="Revisão da importação">
        <AccessDenied message="Importação não encontrada nesta empresa." />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Revisão da importação"
      description={`${batch.file_name} · ${IMPORT_SOURCE_LABELS[batch.source_type]} · ${IMPORT_FORMAT_LABELS[batch.file_format]}`}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/importacoes">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Situação" value={IMPORT_STATUS_LABELS[batch.status]} />
          <SummaryCard label="Entradas" value={formatBRL(summary.entrada)} />
          <SummaryCard label="Saídas" value={formatBRL(summary.saida)} />
          <SummaryCard label="Saldo do arquivo" value={formatBRL(summary.saldo)} />
        </div>

        {(summary.duplicates > 0 || summary.incomplete > 0) && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {summary.duplicates > 0 &&
                  `${summary.duplicates} lançamento(s) com possível duplicidade. `}
                {summary.incomplete > 0 &&
                  `${summary.incomplete} lançamento(s) sem data, valor ou natureza — corrija antes de confirmar.`}
              </span>
            </p>
          </div>
        )}

        {canImport && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
            <span className="text-sm text-muted-foreground">
              {selected.size} selecionado(s)
            </span>
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Categoria em lote" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>{UNCLASSIFIED_LABEL}</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || selected.size === 0 || !bulkCategory}
              onClick={() => void applyBulkCategory()}
            >
              Aplicar categoria
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || selected.size === 0}
              onClick={() => void discardSelected()}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Descartar
            </Button>
            <Button
              size="sm"
              disabled={busy || selected.size === 0}
              onClick={() => void confirm(pending.filter((s) => selected.has(s.id)))}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Confirmar selecionados
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || pending.length === 0}
              onClick={() => void confirm(pending)}
            >
              Confirmar todos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  const url = await signedDocumentUrl(batch.storage_path);
                  window.open(url, "_blank", "noopener");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Arquivo indisponível.");
                }
              }}
            >
              <Download className="mr-1.5 h-4 w-4" /> Arquivo original
            </Button>
          </div>
        )}

        {/* Tabela (desktop) */}
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={pending.length > 0 && selected.size === pending.length}
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(pending.map((s) => s.id)) : new Set())
                    }
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(staged ?? []).map((s) => (
                <TableRow key={s.id} className={s.status !== "pendente" ? "opacity-60" : undefined}>
                  <TableCell>
                    {s.status === "pendente" && (
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          })
                        }
                        aria-label={`Selecionar ${s.description}`}
                      />
                    )}
                  </TableCell>
                  <TableCell>{s.posted_at ? formatDate(s.posted_at) : "—"}</TableCell>
                  <TableCell className="max-w-[22rem] truncate">{s.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.amount === null ? "—" : formatBRL(Number(s.amount))}
                  </TableCell>
                  <TableCell>{s.direction ? DIRECTION_LABELS[s.direction] : "—"}</TableCell>
                  <TableCell>{categoryName(s.category_id)}</TableCell>
                  <TableCell className="text-xs">
                    {s.status === "confirmado" ? (
                      <span className="text-primary">Confirmado</span>
                    ) : s.status === "descartado" ? (
                      "Descartado"
                    ) : s.duplicate_state === "possivel" ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        Possível duplicidade
                      </span>
                    ) : (
                      "Pendente"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canImport && s.status === "pendente" && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        Editar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Cards (mobile) */}
        <ul className="space-y-3 lg:hidden">
          {(staged ?? []).map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.posted_at ? formatDate(s.posted_at) : "sem data"} · {categoryName(s.category_id)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {s.amount === null ? "—" : formatBRL(Number(s.amount))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.direction ? DIRECTION_LABELS[s.direction] : "—"}
                  </p>
                </div>
              </div>
              {s.duplicate_state === "possivel" && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  Possível duplicidade — {s.duplicate_reason}
                </p>
              )}
              {canImport && s.status === "pendente" && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                    Editar
                  </Button>
                  <Button size="sm" onClick={() => void confirm([s])}>
                    Confirmar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {batch.status === "confirmado" && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            Importação concluída.{" "}
            <button
              className="font-medium text-primary underline"
              onClick={() => navigate({ to: "/lancamentos" })}
            >
              Ver lançamentos
            </button>
          </div>
        )}
      </div>

      {editing && (
        <EditStagedDialog
          row={editing}
          categories={categories ?? []}
          subcategories={subcategories ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function EditStagedDialog({
  row,
  categories,
  subcategories,
  onClose,
  onSaved,
}: {
  row: StagedTransaction;
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; name: string; category_id: string }>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [postedAt, setPostedAt] = useState(row.posted_at ?? "");
  const [description, setDescription] = useState(row.description);
  const [amount, setAmount] = useState(row.amount === null ? "" : String(row.amount));
  const [direction, setDirection] = useState<TransactionDirection | "">(row.direction ?? "");
  const [categoryId, setCategoryId] = useState(row.category_id ?? NO_CATEGORY);
  const [subcategoryId, setSubcategoryId] = useState(row.subcategory_id ?? NO_CATEGORY);
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsedAmount = parseBRL(amount);
    if (!postedAt) return toast.error("Informe a data do lançamento.");
    if (parsedAmount === null) return toast.error("Informe um valor válido (ex.: 1.234,56).");
    if (!direction) return toast.error("Informe se o lançamento é entrada ou saída.");
    setBusy(true);
    const { error } = await supabase
      .from("staged_transactions")
      .update({
        posted_at: postedAt,
        description,
        normalized_description: description
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim(),
        amount: parsedAmount,
        direction,
        category_id: categoryId === NO_CATEGORY ? null : categoryId,
        subcategory_id: subcategoryId === NO_CATEGORY ? null : subcategoryId,
        duplicate_state: row.duplicate_state === "possivel" ? "ignorada" : row.duplicate_state,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`);
    toast.success("Lançamento atualizado.");
    await onSaved();
  }

  const subs = subcategories.filter((s) => s.category_id === categoryId);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar lançamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-date">Data</Label>
              <Input
                id="e-date"
                type="date"
                value={postedAt}
                onChange={(e) => setPostedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Valor</Label>
              <Input
                id="e-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1.234,56"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-desc">Descrição</Label>
            <Input
              id="e-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Natureza</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as TransactionDirection)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  setCategoryId(v);
                  setSubcategoryId(NO_CATEGORY);
                }}
              >
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
            <div className="space-y-1.5">
              <Label>Subcategoria</Label>
              <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={!subs.length}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>—</SelectItem>
                  {subs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
