import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Wallet } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCOUNT_TYPE_LABELS,
  APP_NAME,
  RECORD_STATUS_LABELS,
  type AccountType,
  type BankAccount,
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

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: `Contas Bancárias — ${APP_NAME}` },
      { name: "description", content: "Cadastro de contas correntes, poupança e aplicações." },
    ],
  }),
  component: AccountsPage,
});

type AccountWithInstitution = BankAccount & {
  financial_institutions: { name: string } | null;
};

type FormState = {
  institution_id: string;
  agency: string;
  account_number: string;
  account_digit: string;
  type: AccountType;
  holder: string;
  holder_document: string;
  nickname: string;
};

function AccountsPage() {
  const { company, user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountWithInstitution | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<AccountWithInstitution | null>(null);

  const canCreate = hasPermission("account.create");
  const canUpdate = hasPermission("account.update");

  const { data: institutions } = useQuery({
    queryKey: ["institutions", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_institutions")
        .select("id, name, status")
        .eq("company_id", company!.id)
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*, financial_institutions(name)")
        .eq("company_id", company!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as AccountWithInstitution[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts ?? [];
    return (accounts ?? []).filter(
      (a) =>
        (a.nickname ?? "").toLowerCase().includes(q) ||
        a.account_number.includes(q) ||
        (a.financial_institutions?.name ?? "").toLowerCase().includes(q) ||
        (a.holder ?? "").toLowerCase().includes(q),
    );
  }, [accounts, search]);

  function emptyForm(): FormState {
    return {
      institution_id: institutions?.[0]?.id ?? "",
      agency: "",
      account_number: "",
      account_digit: "",
      type: "corrente",
      holder: "",
      holder_document: "",
      nickname: "",
    };
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(account: AccountWithInstitution) {
    setEditing(account);
    setForm({
      institution_id: account.institution_id,
      agency: account.agency ?? "",
      account_number: account.account_number,
      account_digit: account.account_digit ?? "",
      type: account.type,
      holder: account.holder ?? "",
      holder_document: account.holder_document ?? "",
      nickname: account.nickname ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const payload = {
        institution_id: form.institution_id,
        agency: form.agency || null,
        account_number: form.account_number,
        account_digit: form.account_digit || null,
        type: form.type,
        holder: form.holder || null,
        holder_document: form.holder_document || null,
        nickname: form.nickname || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("bank_accounts")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Conta atualizada.");
      } else {
        const { error } = await supabase.from("bank_accounts").insert({
          ...payload,
          company_id: company!.id,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        toast.success("Conta cadastrada.");
      }
      await queryClient.invalidateQueries({ queryKey: ["accounts", company!.id] });
      await queryClient.invalidateQueries({ queryKey: ["count"] });
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(account: AccountWithInstitution) {
    const next = account.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase
      .from("bank_accounts")
      .update({ status: next })
      .eq("id", account.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(next === "inativo" ? "Conta inativada." : "Conta reativada.");
      queryClient.invalidateQueries({ queryKey: ["accounts", company!.id] });
    }
    setToggleTarget(null);
  }

  const noInstitutions = (institutions ?? []).length === 0;

  return (
    <AppShell
      title="Contas Bancárias"
      description="Contas correntes, poupança, pagamento e investimento"
      actions={
        canCreate && !noInstitutions ? (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Nova conta
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por apelido, número, banco ou titular…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : noInstitutions ? (
        <EmptyState
          icon={Wallet}
          title="Cadastre uma instituição primeiro"
          description="Contas bancárias precisam estar vinculadas a uma instituição financeira ativa."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/instituicoes">Ir para Instituições</Link>
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={search ? "Nenhuma conta encontrada" : "Nenhuma conta cadastrada"}
          description={
            search
              ? "Ajuste a busca para localizar a conta."
              : "Cadastre contas correntes, poupança ou aplicações da empresa."
          }
          action={
            canCreate && !search ? (
              <Button onClick={openCreate} size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Cadastrar conta
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Instituição</TableHead>
                <TableHead>Agência / Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Titular</TableHead>
                <TableHead className="w-28">Status</TableHead>
                {canUpdate && <TableHead className="w-32 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    {account.nickname ?? account.account_number}
                  </TableCell>
                  <TableCell>{account.financial_institutions?.name ?? "—"}</TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {account.agency ?? "—"} / {account.account_number}
                    {account.account_digit ? `-${account.account_digit}` : ""}
                  </TableCell>
                  <TableCell>{ACCOUNT_TYPE_LABELS[account.type]}</TableCell>
                  <TableCell>{account.holder ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={account.status}
                      label={RECORD_STATUS_LABELS[account.status]}
                    />
                  </TableCell>
                  {canUpdate && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(account)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(account)}
                        >
                          {account.status === "ativo" ? "Inativar" : "Reativar"}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar conta" : "Nova conta bancária"}</DialogTitle>
          </DialogHeader>
          {form && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Instituição</Label>
                  <Select
                    value={form.institution_id}
                    onValueChange={(v) => setForm({ ...form, institution_id: v })}
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
                <div className="space-y-1.5">
                  <Label>Tipo da conta</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as AccountType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-agency">Agência</Label>
                  <Input
                    id="acc-agency"
                    value={form.agency}
                    onChange={(e) => setForm({ ...form, agency: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-number">Número da conta</Label>
                  <Input
                    id="acc-number"
                    value={form.account_number}
                    onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-digit">Dígito</Label>
                  <Input
                    id="acc-digit"
                    value={form.account_digit}
                    onChange={(e) => setForm({ ...form, account_digit: e.target.value })}
                    maxLength={2}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-holder">Titular</Label>
                  <Input
                    id="acc-holder"
                    value={form.holder}
                    onChange={(e) => setForm({ ...form, holder: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-doc">CPF/CNPJ do titular</Label>
                  <Input
                    id="acc-doc"
                    value={form.holder_document}
                    onChange={(e) => setForm({ ...form, holder_document: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-nick">Apelido da conta</Label>
                <Input
                  id="acc-nick"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="Ex.: Conta Matriz, Conta Aplicações"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !form.institution_id}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.status === "ativo" ? "Inativar conta" : "Reativar conta"}
        description={
          toggleTarget?.status === "ativo"
            ? `A conta "${toggleTarget?.nickname ?? toggleTarget?.account_number}" ficará inativa. O histórico é preservado e a ação será auditada.`
            : "A conta voltará a ficar ativa."
        }
        confirmLabel={toggleTarget?.status === "ativo" ? "Inativar" : "Reativar"}
        destructive={toggleTarget?.status === "ativo"}
        onConfirm={() => toggleTarget && toggleStatus(toggleTarget)}
      />
    </AppShell>
  );
}
