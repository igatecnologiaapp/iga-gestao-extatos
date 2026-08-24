import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { AppShell, RequireCompany } from "@/components/app-shell";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import { APP_NAME, PERMISSION_LABELS, ROLE_LABELS, type Company } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: `Configurações — ${APP_NAME}` },
      { name: "description", content: "Dados da empresa, perfil do usuário e permissões." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireCompany>
      {({ company }) => <SettingsContent company={company} />}
    </RequireCompany>
  );
}

function SettingsContent({ company }: { company: Company }) {
  const { user, role, permissions, hasPermission, setCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const canManageCompany = hasPermission("company.manage");

  const [companyForm, setCompanyForm] = useState({
    name: company.name,
    document: company.document ?? "",
  });
  const [savingCompany, setSavingCompany] = useState(false);

  const [profileName, setProfileName] = useState(
    (user?.user_metadata?.["full_name"] as string | undefined) ?? "",
  );
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSavingCompany(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          name: companyForm.name,
          document: companyForm.document || null,
        })
        .eq("id", company.id);
      if (error) throw error;
      toast.success("Dados da empresa atualizados.");
      setCompanyId(company.id);
      await queryClient.invalidateQueries({ queryKey: ["memberships", user?.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSavingCompany(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: profileName })
        .eq("id", user!.id);
      if (error) throw error;
      toast.success("Perfil atualizado. O nome aparecerá em novas sessões.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <AppShell
      title="Configurações"
      description="Dados da empresa, seu perfil e suas permissões de acesso"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold text-foreground">Empresa</h2>
          </div>
          <form onSubmit={saveCompany} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-company-name">Nome da empresa</Label>
              <Input
                id="cfg-company-name"
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                disabled={!canManageCompany}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-company-doc">CNPJ/CPF</Label>
              <Input
                id="cfg-company-doc"
                value={companyForm.document}
                onChange={(e) => setCompanyForm({ ...companyForm, document: e.target.value })}
                disabled={!canManageCompany}
                placeholder="00.000.000/0001-00"
              />
            </div>
            {canManageCompany ? (
              <Button type="submit" size="sm" disabled={savingCompany}>
                {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar empresa
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Somente administradores podem editar os dados da empresa.
              </p>
            )}
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold text-foreground">Meu perfil</h2>
          </div>
          <form onSubmit={saveProfile} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-name">Nome completo</Label>
              <Input
                id="cfg-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={user?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">
                O e-mail de acesso não pode ser alterado por aqui.
              </p>
            </div>
            <Button type="submit" size="sm" disabled={savingProfile}>
              {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar perfil
            </Button>
          </form>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold text-foreground">
            Suas permissões nesta empresa
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Papel atual: <span className="font-medium">{role ? ROLE_LABELS[role] : "—"}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[...permissions].sort().map((key) => (
            <span
              key={key}
              className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground"
            >
              {PERMISSION_LABELS[key] ?? key}
            </span>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
