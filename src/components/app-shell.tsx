import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  ReceiptText,
  Scale,
  ScrollText,
  Settings,
  Tags,
  TrendingDown,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { useCompany } from "@/lib/company-context";
import { APP_NAME, ROLE_LABELS, type AppRole, type Company } from "@/lib/domain";
import { supabase } from "@/lib/backend-client";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/instituicoes", label: "Instituições", icon: Landmark, permission: "institution.view" },
  { to: "/contas", label: "Contas", icon: Wallet, permission: "account.view" },
  { to: "/cartoes", label: "Cartões", icon: CreditCard, permission: "card.view" },
  { to: "/categorias", label: "Categorias", icon: Tags, permission: "category.view" },
  { to: "/usuarios", label: "Usuários", icon: Users, permission: "member.manage" },
  { to: "/auditoria", label: "Auditoria", icon: ScrollText, permission: "audit.view" },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

const FUTURE_ITEMS = [
  { label: "Importações", icon: Upload, phase: "Fase 2" },
  { label: "Lançamentos", icon: ReceiptText, phase: "Fase 2" },
  { label: "Faturas", icon: FileText, phase: "Fase 3" },
  { label: "Conciliação", icon: Scale, phase: "Fase 4" },
  { label: "Custos Financeiros", icon: TrendingDown, phase: "Fase 5" },
  { label: "Relatórios", icon: BarChart3, phase: "Fase 5" },
];

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function ContextStatusScreen({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Building2 className="h-5 w-5" />
        </div>
        <h1 className="mt-4 font-display text-lg font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <Button
              onClick={async () => {
                setRetrying(true);
                try {
                  await onRetry();
                } finally {
                  setRetrying(false);
                }
              }}
              disabled={retrying}
            >
              {retrying && <Loader2 className="h-4 w-4 animate-spin" />}
              Tentar novamente
            </Button>
          )}
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Guarda de contexto de empresa para as rotas autenticadas.
 *
 * Resolve os estados previsíveis de negócio sem quebrar a aplicação:
 * - carregando sessão/vínculos → loader;
 * - usuário sem nenhum vínculo → redireciona para o onboarding;
 * - usuário apenas com vínculos inativos → tela de acesso desativado;
 * - empresa inativa → tela de empresa desativada;
 * - caso contrário, renderiza o conteúdo com `company` garantida.
 */
export function RequireCompany({
  children,
}: {
  children: (ctx: { company: Company; role: AppRole | null }) => ReactNode;
}) {
  const { status, retry } = useCompany();

  if (status.kind === "loading") return <FullScreenLoader />;

  if (status.kind === "error") {
    console.error("[CompanyProvider] Contexto empresarial indisponível", status.message);
    return (
      <ContextStatusScreen
        title="Não foi possível carregar seu acesso"
        description="Houve uma falha ao consultar sua empresa e suas permissões. Tente novamente ou saia para retornar ao login."
        onRetry={retry}
      />
    );
  }

  if (status.kind === "no-membership") return <Navigate to="/onboarding" replace />;

  if (status.kind === "inactive-membership") {
    return (
      <ContextStatusScreen
        title="Seu acesso está desativado"
        description="Seu vínculo com a empresa foi desativado. Procure um administrador da empresa para reativar seu acesso."
      />
    );
  }

  if (status.kind === "invalid-membership") {
    return (
      <ContextStatusScreen
        title="Vínculo empresarial inconsistente"
        description="Seu acesso existe, mas a empresa ou o papel vinculado não pôde ser identificado. Tente novamente ou contate o suporte."
        onRetry={retry}
      />
    );
  }

  if (status.kind === "inactive-company") {
    return (
      <ContextStatusScreen
        title="Empresa inativa"
        description="Esta empresa está inativa no momento. Entre em contato com o suporte para regularizar o acesso."
      />
    );
  }

  return <>{children({ company: status.company, role: status.role })}</>;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, memberships, company, setCompanyId, role, hasPermission } = useCompany();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Landmark className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold tracking-tight text-sidebar-accent-foreground">
            {APP_NAME}
          </p>
          <p className="text-[11px] text-sidebar-foreground/60">finanças empresariais</p>
        </div>
      </div>

      <div className="px-4 pb-4">
        {memberships.length > 1 ? (
          <Select value={company?.id ?? ""} onValueChange={setCompanyId}>
            <SelectTrigger className="w-full border-sidebar-border bg-sidebar-accent/60 text-sidebar-accent-foreground hover:bg-sidebar-accent">
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              {memberships.map((m) => (
                <SelectItem key={m.company_id} value={m.company_id}>
                  {m.companies?.name ?? "Empresa"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2">
            <Building2 className="h-4 w-4 shrink-0 text-sidebar-primary" />
            <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
              {company?.name}
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {visibleItems.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <p className="px-3 pt-5 pb-1.5 text-[10px] font-semibold tracking-widest text-sidebar-foreground/40 uppercase">
          Próximas fases
        </p>
        {FUTURE_ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/35"
            title={`${item.label} — disponível na ${item.phase}`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            <span className="rounded-full border border-sidebar-border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-sidebar-foreground/45">
              {item.phase}
            </span>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-2 min-w-0 px-1">
          <p className="truncate text-sm font-medium text-sidebar-accent-foreground">
            {(user?.user_metadata?.["full_name"] as string | undefined) || user?.email}
          </p>
          <p className="text-[11px] text-sidebar-foreground/55">{role ? ROLE_LABELS[role] : ""}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { company } = useCompany();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!company) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 z-10 rounded-md p-1 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
            <button
              className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{title}</h1>
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <p className="font-display text-base font-semibold text-foreground">Acesso restrito</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "Seu papel não possui permissão para acessar este recurso."}
      </p>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Landmark;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-display text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
