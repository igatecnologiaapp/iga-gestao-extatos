import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Lock, Pencil, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_NAME,
  RECORD_STATUS_LABELS,
  type Category,
  type Company,
  type Subcategory,
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

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({
    meta: [
      { title: `Categorias — ${APP_NAME}` },
      {
        name: "description",
        content: "Categorias e subcategorias para classificar lançamentos financeiros.",
      },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  return (
    <RequireCompany>
      {({ company }) => <CategoriesContent company={company} />}
    </RequireCompany>
  );
}

function CategoriesContent({ company }: { company: Company }) {
  const { hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const canManage = hasPermission("category.manage");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{
    kind: "category" | "subcategory";
    editing: Category | Subcategory | null;
    parent?: Category | undefined;
  } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<{
    kind: "category" | "subcategory";
    row: Category | Subcategory;
  } | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_categories")
        .select("*")
        .eq("company_id", company!.id)
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subcategories } = useQuery({
    queryKey: ["subcategories", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_subcategories")
        .select("*")
        .eq("company_id", company!.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate(kind: "category" | "subcategory", parent?: Category) {
    setDialog({ kind, editing: null, parent });
    setName("");
  }

  function openEdit(kind: "category" | "subcategory", row: Category | Subcategory) {
    setDialog({ kind, editing: row });
    setName(row.name);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.kind === "category") {
        if (dialog.editing) {
          const { error } = await supabase
            .from("transaction_categories")
            .update({ name })
            .eq("id", dialog.editing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("transaction_categories")
            .insert({ company_id: company!.id, name, is_system: false });
          if (error) throw error;
        }
        await queryClient.invalidateQueries({ queryKey: ["categories", company!.id] });
      } else {
        if (dialog.editing) {
          const { error } = await supabase
            .from("transaction_subcategories")
            .update({ name })
            .eq("id", dialog.editing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("transaction_subcategories").insert({
            company_id: company!.id,
            category_id: dialog.parent!.id,
            name,
          });
          if (error) throw error;
        }
        await queryClient.invalidateQueries({ queryKey: ["subcategories", company!.id] });
      }
      toast.success("Salvo com sucesso.");
      setDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!toggleTarget) return;
    const { kind, row } = toggleTarget;
    const next = row.status === "ativo" ? "inativo" : "ativo";
    const table =
      kind === "category" ? "transaction_categories" : "transaction_subcategories";
    const { error } = await supabase.from(table).update({ status: next }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(next === "inativo" ? "Inativado." : "Reativado.");
      queryClient.invalidateQueries({
        queryKey: [kind === "category" ? "categories" : "subcategories", company!.id],
      });
    }
    setToggleTarget(null);
  }

  return (
    <AppShell
      title="Categorias e Subcategorias"
      description="Classificação usada nos lançamentos de extratos e faturas"
      actions={
        canManage ? (
          <Button onClick={() => openCreate("category")} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Nova categoria
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (categories ?? []).length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Nenhuma categoria cadastrada"
          description="As categorias padrão (Compra, Taxa, Juros) são criadas automaticamente no provisionamento da empresa."
        />
      ) : (
        <div className="space-y-3">
          {(categories ?? []).map((category) => {
            const subs = (subcategories ?? []).filter((s) => s.category_id === category.id);
            const isOpen = expanded.has(category.id);
            return (
              <div
                key={category.id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleExpanded(category.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    aria-label={isOpen ? "Recolher" : "Expandir"}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{category.name}</p>
                      {category.is_system && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                          <Lock className="h-2.5 w-2.5" /> Sistema
                        </span>
                      )}
                      <StatusBadge
                        status={category.status}
                        label={RECORD_STATUS_LABELS[category.status]}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {subs.length} subcategoria{subs.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit("category", category)}
                        aria-label="Editar categoria"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openCreate("subcategory", category)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Subcategoria
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToggleTarget({ kind: "category", row: category })}
                      >
                        {category.status === "ativo" ? "Inativar" : "Reativar"}
                      </Button>
                    </div>
                  )}
                </div>
                {isOpen && (
                  <div className="border-t border-border bg-muted/30 px-4 py-2">
                    {subs.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">
                        Nenhuma subcategoria.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {subs.map((sub) => (
                          <li key={sub.id} className="flex items-center gap-3 py-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                            <span className="flex-1 text-sm text-foreground">{sub.name}</span>
                            <StatusBadge
                              status={sub.status}
                              label={RECORD_STATUS_LABELS[sub.status]}
                            />
                            {canManage && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEdit("subcategory", sub)}
                                  aria-label="Editar subcategoria"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    setToggleTarget({ kind: "subcategory", row: sub })
                                  }
                                >
                                  {sub.status === "ativo" ? "Inativar" : "Reativar"}
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.editing
                ? `Editar ${dialog.kind === "category" ? "categoria" : "subcategoria"}`
                : `Nova ${dialog?.kind === "category" ? "categoria" : "subcategoria"}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {dialog?.parent && (
              <p className="text-sm text-muted-foreground">
                Categoria pai: <span className="font-medium">{dialog.parent.name}</span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nome</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex.: Reembolso"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
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
          toggleTarget?.row.status === "ativo"
            ? `Inativar ${toggleTarget.kind === "category" ? "categoria" : "subcategoria"}`
            : `Reativar ${toggleTarget?.kind === "category" ? "categoria" : "subcategoria"}`
        }
        description={
          toggleTarget?.row.status === "ativo"
            ? `"${toggleTarget.row.name}" ficará indisponível para novos lançamentos. O histórico é preservado.`
            : `"${toggleTarget?.row.name}" voltará a ficar disponível.`
        }
        confirmLabel={toggleTarget?.row.status === "ativo" ? "Inativar" : "Reativar"}
        destructive={toggleTarget?.row.status === "ativo"}
        onConfirm={toggleStatus}
      />
    </AppShell>
  );
}
