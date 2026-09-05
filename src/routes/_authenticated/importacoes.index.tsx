import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AccessDenied, AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/lib/backend-client";
import {
  APP_NAME,
  IMPORT_FORMAT_LABELS,
  IMPORT_SOURCE_LABELS,
  IMPORT_STATUS_LABELS,
  type Company,
  type ImportBatch,
  type ImportSourceType,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { ACCEPTED_EXTENSIONS, ImportError } from "@/lib/importers";
import { createImport, DuplicateFileError } from "@/lib/import-service";
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

export const Route = createFileRoute("/_authenticated/importacoes")({
  head: () => ({
    meta: [
      { title: `Importações — ${APP_NAME}` },
      {
        name: "description",
        content: "Envie extratos e faturas, processe e revise os lançamentos antes de confirmar.",
      },
      { property: "og:title", content: `Importações — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Central de importação de extratos bancários e faturas de cartão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportsPage,
});

function ImportsPage() {
  return <RequireCompany>{({ company }) => <ImportsContent company={company} />}</RequireCompany>;
}

const STATUS_STYLE: Record<string, string> = {
  confirmado: "bg-primary/10 text-primary",
  revisao: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  erro: "bg-destructive/10 text-destructive",
  processando: "bg-muted text-muted-foreground",
  recebido: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground",
};

function ImportsContent({ company }: { company: Company }) {
  const { user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const canImport = hasPermission("import.execute");
  const canView = hasPermission("transaction.view") || canImport;

  const { data: batches, isLoading } = useQuery({
    queryKey: ["imports", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ImportBatch[];
    },
  });

  if (!canView) {
    return (
      <AppShell title="Importações">
        <AccessDenied />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Importações"
      description="Extratos e faturas enviados para processamento"
      actions={
        canImport ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Nova importação
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (batches ?? []).length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="Nenhuma importação ainda"
          description="Envie um extrato bancário ou uma fatura de cartão nos formatos PDF, OFX, CSV ou XLS/XLSX."
          action={
            canImport ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" /> Enviar arquivo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {(batches ?? []).map((b) => (
            <li key={b.id}>
              <Link
                to="/importacoes/$id"
                params={{ id: b.id }}
                className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{b.file_name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {IMPORT_SOURCE_LABELS[b.source_type]} · {IMPORT_FORMAT_LABELS[b.file_format]} ·{" "}
                      {formatDateTime(b.created_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[b.status] ?? ""}`}
                  >
                    {IMPORT_STATUS_LABELS[b.status]}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{b.parsed_count} lançamento(s) extraído(s)</span>
                  <span>{b.confirmed_count} confirmado(s)</span>
                  {b.error_message && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> {b.error_message}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canImport && (
        <NewImportDialog
          open={open}
          onOpenChange={setOpen}
          company={company}
          userId={user?.id ?? null}
          onCreated={async (batch) => {
            await queryClient.invalidateQueries({ queryKey: ["imports", company.id] });
            setOpen(false);
            navigate({ to: "/importacoes/$id", params: { id: batch.id } });
          }}
        />
      )}
    </AppShell>
  );
}

function NewImportDialog({
  open,
  onOpenChange,
  company,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company: Company;
  userId: string | null;
  onCreated: (batch: ImportBatch) => void | Promise<void>;
}) {
  const [sourceType, setSourceType] = useState<ImportSourceType>("conta");
  const [institutionId, setInstitutionId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const { data: institutions } = useQuery({
    queryKey: ["institutions", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_institutions")
        .select("id, name")
        .eq("company_id", company.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts-min", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, nickname, account_number, institution_id")
        .eq("company_id", company.id)
        .eq("status", "ativo")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cards } = useQuery({
    queryKey: ["cards-min", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, nickname, last_four_digits, institution_id")
        .eq("company_id", company.id)
        .eq("status", "ativo")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories-min", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_categories")
        .select("id, name")
        .eq("company_id", company.id)
        .eq("status", "ativo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const targets =
    sourceType === "conta"
      ? (accounts ?? [])
          .filter((a) => !institutionId || a.institution_id === institutionId)
          .map((a) => ({ id: a.id, label: a.nickname || a.account_number }))
      : (cards ?? [])
          .filter((c) => !institutionId || c.institution_id === institutionId)
          .map((c) => ({
            id: c.id,
            label: `${c.nickname}${c.last_four_digits ? ` •••• ${c.last_four_digits}` : ""}`,
          }));

  async function submit(allowDuplicateFile: boolean) {
    if (!file) {
      toast.error("Selecione o arquivo do extrato ou da fatura.");
      return;
    }
    setBusy(true);
    try {
      const batch = await createImport({
        companyId: company.id,
        userId,
        sourceType,
        institutionId: institutionId || null,
        accountId: sourceType === "conta" ? targetId || null : null,
        cardId: sourceType === "cartao" ? targetId || null : null,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
        file,
        categories: categories ?? [],
        allowDuplicateFile,
      });
      setDuplicate(null);
      toast.success(`Arquivo processado: ${batch.parsed_count} lançamento(s) para revisão.`);
      await onCreated(batch);
    } catch (err) {
      if (err instanceof DuplicateFileError) {
        setDuplicate(err.message);
      } else if (err instanceof ImportError) {
        toast.error(err.message);
      } else {
        toast.error(err instanceof Error ? err.message : "Não foi possível processar o arquivo.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova importação</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Input value={company.name} readOnly disabled />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select
                value={sourceType}
                onValueChange={(v) => {
                  setSourceType(v as ImportSourceType);
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
              <Label>Instituição</Label>
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  setInstitutionId(v);
                  setTargetId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(institutions ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{sourceType === "conta" ? "Conta bancária" : "Cartão"}</Label>
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
            {targets.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum cadastro ativo encontrado para esta origem/instituição.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-start">Período inicial (opcional)</Label>
              <Input
                id="p-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-end">Período final (opcional)</Label>
              <Input
                id="p-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="file">Arquivo</Label>
            <Input
              id="file"
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setDuplicate(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: PDF (com texto), OFX, CSV e XLS/XLSX.
            </p>
          </div>

          {duplicate && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-start gap-2 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {duplicate}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={busy}
                onClick={() => void submit(true)}
              >
                Importar mesmo assim
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !file || !targetId}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar e processar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
