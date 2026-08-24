import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { AppShell, EmptyState, RequireCompany } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCompany } from "@/lib/company-context";
import { inviteMember } from "@/lib/members.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_NAME,
  RECORD_STATUS_LABELS,
  ROLE_LABELS,
  type AppRole,
  type Company,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: `Usuários e Permissões — ${APP_NAME}` },
      { name: "description", content: "Gestão de membros da empresa e seus papéis de acesso." },
    ],
  }),
  component: UsersPage,
});

type MemberRow = {
  id: string;
  user_id: string;
  role: AppRole;
  status: "ativo" | "inativo";
  created_at: string;
  profiles: { email: string | null; full_name: string | null } | null;
};

function UsersPage() {
  return (
    <RequireCompany>
      {({ company }) => <UsersContent company={company} />}
    </RequireCompany>
  );
}

function UsersContent({ company }: { company: Company }) {
  const { user, hasPermission } = useCompany();
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteMember);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: "",
    email: "",
    role: "consulta" as AppRole,
  });
  const [saving, setSaving] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<MemberRow | null>(null);

  const isAdmin = hasPermission("member.manage");

  const { data: members, isLoading } = useQuery({
    queryKey: ["members", company!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, role, status, created_at, profiles(email, full_name)")
        .eq("company_id", company!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as MemberRow[];
    },
  });

  const activeAdmins = useMemo(
    () => (members ?? []).filter((m) => m.role === "admin" && m.status === "ativo"),
    [members],
  );

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await invite({
        data: {
          companyId: company!.id,
          email: inviteForm.email,
          fullName: inviteForm.fullName,
          role: inviteForm.role,
        },
      });
      toast.success("Convite enviado e usuário vinculado à empresa.");
      await queryClient.invalidateQueries({ queryKey: ["members", company!.id] });
      setInviteOpen(false);
      setInviteForm({ fullName: "", email: "", role: "consulta" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao convidar.");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member: MemberRow, role: AppRole) {
    if (member.role === "admin" && member.status === "ativo" && role !== "admin" && activeAdmins.length <= 1) {
      toast.error("A empresa precisa manter ao menos um administrador ativo.");
      return;
    }
    const { error } = await supabase
      .from("user_roles")
      .update({ role })
      .eq("id", member.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Papel atualizado.");
      queryClient.invalidateQueries({ queryKey: ["members", company!.id] });
    }
  }

  async function toggleStatus() {
    if (!toggleTarget) return;
    if (
      toggleTarget.role === "admin" &&
      toggleTarget.status === "ativo" &&
      activeAdmins.length <= 1
    ) {
      toast.error("A empresa precisa manter ao menos um administrador ativo.");
      setToggleTarget(null);
      return;
    }
    const next = toggleTarget.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase
      .from("user_roles")
      .update({ status: next })
      .eq("id", toggleTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(next === "inativo" ? "Acesso revogado." : "Acesso restaurado.");
      queryClient.invalidateQueries({ queryKey: ["members", company!.id] });
    }
    setToggleTarget(null);
  }

  return (
    <AppShell
      title="Usuários e Permissões"
      description="Membros da empresa, papéis de acesso e convites por e-mail"
      actions={
        isAdmin ? (
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Convidar usuário
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (members ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum membro encontrado"
          description="Convide usuários para colaborar nesta empresa."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Vinculado em</TableHead>
                {isAdmin && <TableHead className="w-32 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">
                      {member.profiles?.full_name ?? "Usuário"}
                      {member.user_id === user?.id && (
                        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                          você
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.profiles?.email ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) => changeRole(member, v as AppRole)}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      ROLE_LABELS[member.role]
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={member.status}
                      label={RECORD_STATUS_LABELS[member.status]}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(member.created_at)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {member.user_id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToggleTarget(member)}
                        >
                          {member.status === "ativo" ? "Revogar" : "Restaurar"}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-foreground">
          O que cada papel pode fazer
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RoleCard
            title="Administrador"
            items={["Tudo do Financeiro", "Gerenciar usuários", "Configurar a empresa"]}
          />
          <RoleCard
            title="Financeiro"
            items={["Cadastrar e editar cadastros", "Importar documentos", "Executar conciliação"]}
          />
          <RoleCard title="Consulta" items={["Visualizar cadastros", "Visualizar relatórios"]} />
          <RoleCard
            title="Auditor"
            items={["Tudo do Consulta", "Visualizar trilha de auditoria"]}
          />
        </div>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Nome completo</Label>
              <Input
                id="inv-name"
                value={inviteForm.fullName}
                onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">E-mail</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Papel de acesso</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as AppRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Se o e-mail ainda não tiver conta, um convite será enviado automaticamente.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar convite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.status === "ativo" ? "Revogar acesso" : "Restaurar acesso"}
        description={
          toggleTarget?.status === "ativo"
            ? `"${toggleTarget?.profiles?.full_name ?? toggleTarget?.profiles?.email}" perderá o acesso a esta empresa imediatamente. A ação será auditada.`
            : "O usuário voltará a acessar esta empresa com o papel atual."
        }
        confirmLabel={toggleTarget?.status === "ativo" ? "Revogar" : "Restaurar"}
        destructive={toggleTarget?.status === "ativo"}
        onConfirm={toggleStatus}
      />
    </AppShell>
  );
}

function RoleCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
