import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_NAME,
  INSTITUTION_TYPE_LABELS,
  RECORD_STATUS_LABELS,
  type Company,
  type Institution,
  type InstitutionType,
} from "@/lib/domain";
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

export const Route = createFileRoute("/_authenticated/instituicoes")({
  head: () => ({
    meta: [
      { title: `Instituições Financeiras — ${APP_NAME}` },
      { name: "description", content: "Cadastro de bancos e administradoras de cartão." },
    ],
  }),
  component: InstitutionsPage,
});

type FormState = { code: string; name: string; type: InstitutionType };

const EMPTY_FORM: FormState = { code: "", name: "", type: "banco" };

function InstitutionsPage() {
  return (
    <RequireCompany>
      {({ company }) => <InstitutionsContent company={company} />}
    </RequireCompany>
  );
}

function InstitutionsContent({ company }: { company: Company }) {
  const { user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Institution | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Institution | null>(null);

  const canCreate = hasPermission("institution.create");
  const canUpdate = hasPermission("institution.update");

  const { data: institutions, isLoading } = useQuery({
    queryKey: ["institutions", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_institutions")
        .select("*")
        .eq("company_id", company!.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return institutions ?? [];
    return (institutions ?? []).filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.code ?? "").toLowerCase().includes(q) ||
        INSTITUTION_TYPE_LABELS[i.type].toLowerCase().includes(q),
    );
  }, [institutions, search]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(institution: Institution) {
    setEditing(institution);
    setForm({ code: institution.code ?? "", name: institution.name, type: institution.type });
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("financial_institutions")
          .update({ code: form.code || null, name: form.name, type: form.type })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Instituição atualizada.");
      } else {
        const { error } = await supabase.from("financial_institutions").insert({
          company_id: company!.id,
          code: form.code || null,
          name: form.name,
          type: form.type,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        toast.success("Instituição cadastrada.");
      }
      await queryClient.invalidateQueries({ queryKey: ["institutions", company!.id] });
      await queryClient.invalidateQueries({ queryKey: ["count"] });
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(institution: Institution) {
    const next = institution.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase
      .from("financial_institutions")
      .update({ status: next })
      .eq("id", institution.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(next === "inativo" ? "Instituição inativada." : "Instituição reativada.");
      queryClient.invalidateQueries({ queryKey: ["institutions", company!.id] });
    }
    setToggleTarget(null);
  }

  return (
    <AppShell
      title="Instituições Financeiras"
      description="Bancos, cooperativas, fintechs e administradoras de cartão"
      actions={
        canCreate ? (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Nova instituição
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, código ou tipo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={search ? "Nenhuma instituição encontrada" : "Nenhuma instituição cadastrada"}
          description={
            search
              ? "Ajuste a busca para localizar a instituição."
              : "Cadastre bancos e administradoras para vincular contas e cartões."
          }
          action={
            canCreate && !search ? (
              <Button onClick={openCreate} size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Cadastrar instituição
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instituição</TableHead>
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-28">Status</TableHead>
                {canUpdate && <TableHead className="w-32 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((institution) => (
                <TableRow key={institution.id}>
                  <TableCell className="font-medium">{institution.name}</TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {institution.code ?? "—"}
                  </TableCell>
                  <TableCell>{INSTITUTION_TYPE_LABELS[institution.type]}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={institution.status}
                      label={RECORD_STATUS_LABELS[institution.status]}
                    />
                  </TableCell>
                  {canUpdate && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(institution)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(institution)}
                        >
                          {institution.status === "ativo" ? "Inativar" : "Reativar"}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar instituição" : "Nova instituição"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inst-name">Nome da instituição</Label>
              <Input
                id="inst-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Ex.: Banco Demonstração"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inst-code">Código do banco</Label>
                <Input
                  id="inst-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ex.: 341"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as InstitutionType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INSTITUTION_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={
          toggleTarget?.status === "ativo" ? "Inativar instituição" : "Reativar instituição"
        }
        description={
          toggleTarget?.status === "ativo"
            ? `"${toggleTarget?.name}" ficará inativa. O histórico é preservado e a ação será auditada.`
            : `"${toggleTarget?.name}" voltará a ficar ativa.`
        }
        confirmLabel={toggleTarget?.status === "ativo" ? "Inativar" : "Reativar"}
        destructive={toggleTarget?.status === "ativo"}
        onConfirm={() => toggleTarget && toggleStatus(toggleTarget)}
      />
    </AppShell>
  );
}
