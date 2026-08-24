import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CreditCard,
  Landmark,
  ScrollText,
  Tags,
  Users,
  Wallet,
} from "lucide-react";

import { AppShell, RequireCompany } from "@/components/app-shell";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import { APP_NAME, AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, type Company } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: `Dashboard — ${APP_NAME}` },
      {
        name: "description",
        content: "Visão geral das instituições, contas, cartões e usuários da sua empresa.",
      },
    ],
  }),
  component: DashboardPage,
});

function useCount(table: string, companyId: string, onlyActive = true) {
  return useQuery({
    queryKey: ["count", table, companyId],
    queryFn: async () => {
      let q = supabase
        .from(table as never)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (onlyActive) q = (q as { eq: (c: string, v: string) => typeof q }).eq("status", "ativo");
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  }).data;
}

function DashboardPage() {
  return (
    <RequireCompany>
      {({ company }) => <DashboardContent company={company} />}
    </RequireCompany>
  );
}

function DashboardContent({ company }: { company: Company }) {
  const { hasPermission } = useCompany();
  const companyId = company.id;

  const institutions = useCount("financial_institutions", companyId);
  const accounts = useCount("bank_accounts", companyId);
  const cards = useCount("cards", companyId);
  const categories = useCount("transaction_categories", companyId, false);
  const users = useCount("user_roles", companyId);

  const { data: recentAudit } = useQuery({
    queryKey: ["audit-recent", companyId],
    enabled: hasPermission("audit.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, entity, user_email, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const metrics = [
    { label: "Instituições ativas", value: institutions, icon: Landmark, to: "/instituicoes" },
    { label: "Contas ativas", value: accounts, icon: Wallet, to: "/contas" },
    { label: "Cartões ativos", value: cards, icon: CreditCard, to: "/cartoes" },
    { label: "Categorias", value: categories, icon: Tags, to: "/categorias" },
    { label: "Usuários ativos", value: users, icon: Users, to: "/usuarios" },
  ];

  const needsSetup = (institutions ?? 0) === 0;

  return (
    <AppShell
      title="Dashboard"
      description={`Visão geral de ${company!.name}`}
    >
      {needsSetup && (
        <div className="mb-6 rounded-lg border border-primary/25 bg-accent/60 p-5">
          <p className="font-display text-sm font-semibold text-foreground">
            Comece pelos cadastros básicos
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre a primeira instituição financeira, depois contas e cartões. A importação
            de extratos será liberada na Fase 2, após homologação da fundação.
          </p>
          <Link
            to="/instituicoes"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Cadastrar instituição <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((m) => (
          <Link
            key={m.label}
            to={m.to}
            className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <m.icon className="h-5 w-5 text-primary" />
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="tabular mt-4 text-3xl font-semibold text-foreground">
              {m.value ?? "—"}
            </p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{m.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Segurança ativa neste ambiente
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              Isolamento de dados por empresa (RLS) validado no banco
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              Controle de acesso por papel: Administrador, Financeiro, Consulta e Auditor
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              Auditoria automática de criações, alterações e inativações
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              Bucket privado para documentos financeiros (extratos e faturas)
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Atividade recente
            </h2>
            {hasPermission("audit.view") && (
              <Link to="/auditoria" className="text-xs font-medium text-primary hover:underline">
                Ver auditoria completa
              </Link>
            )}
          </div>
          {!hasPermission("audit.view") ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Disponível para perfis Administrador e Auditor.
            </p>
          ) : (recentAudit ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhuma atividade registrada ainda.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {(recentAudit ?? []).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action} ·{" "}
                      {AUDIT_ENTITY_LABELS[entry.entity] ?? entry.entity}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.user_email ?? "sistema"} · {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
