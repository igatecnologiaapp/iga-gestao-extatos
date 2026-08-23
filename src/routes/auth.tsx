import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Landmark, Loader2, Lock, ShieldCheck, Building2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { APP_NAME } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Entrar — ${APP_NAME}` },
      {
        name: "description",
        content: "Acesse sua conta para gerenciar extratos, contas e cartões da sua empresa.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "recover";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/" });
      } else {
        setCheckingSession(false);
      }
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/redefinir-senha`,
        });
        if (error) throw error;
        toast.success("Enviamos um link de recuperação para o seu e-mail.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao entrar com Google.");
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Painel institucional */}
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-bold text-sidebar-accent-foreground">
              {APP_NAME}
            </p>
            <p className="text-xs text-sidebar-foreground/60">finanças empresariais</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="font-display text-3xl font-bold leading-tight text-sidebar-accent-foreground">
            Extratos e faturas organizados, com rastreabilidade total.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/75">
            Centralize contas bancárias e cartões em um ambiente seguro, multiempresa e
            auditável — pronto para importação de extratos, conciliação e análise de custos.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-sidebar-primary" />
              Isolamento por empresa com segurança em nível de banco de dados
            </li>
            <li className="flex items-center gap-3">
              <Lock className="h-4 w-4 text-sidebar-primary" />
              Documentos em armazenamento privado e dados sensíveis protegidos
            </li>
            <li className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-sidebar-primary" />
              Perfis de acesso: Administrador, Financeiro, Consulta e Auditor
            </li>
          </ul>
        </div>

        <p className="text-xs text-sidebar-foreground/45">
          Seus dados financeiros nunca ficam em buckets públicos.
        </p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Landmark className="h-5 w-5" />
            </div>
            <p className="font-display text-base font-bold text-foreground">{APP_NAME}</p>
          </div>

          <h2 className="font-display text-2xl font-bold text-foreground">
            {mode === "signin" && "Entrar na sua conta"}
            {mode === "signup" && "Criar sua conta"}
            {mode === "recover" && "Recuperar senha"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" && "Acesse o painel da sua empresa."}
            {mode === "signup" && "Cadastre-se para provisionar sua empresa."}
            {mode === "recover" && "Enviaremos um link para redefinir sua senha."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {mode !== "recover" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" && "Entrar"}
              {mode === "signup" && "Criar conta"}
              {mode === "recover" && "Enviar link de recuperação"}
            </Button>
          </form>

          {mode !== "recover" && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                ou
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={busy}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.96h5.35c-.24 1.39-.98 2.57-2.09 3.36v2.79h3.38c1.98-1.82 3.53-4.51 3.53-7.69 0-.52-.05-1.02-.14-1.42z"
                  />
                  <path
                    fill="currentColor"
                    d="M12.18 22c2.83 0 5.2-.94 6.93-2.54l-3.38-2.79c-.94.63-2.14 1-3.55 1-2.73 0-5.04-1.84-5.87-4.32H2.82v2.88C4.55 19.96 8.08 22 12.18 22z"
                    opacity=".7"
                  />
                  <path
                    fill="currentColor"
                    d="M6.31 13.35a6.6 6.6 0 0 1 0-4.7V5.77H2.82a10.02 10.02 0 0 0 0 8.46l3.49-2.88z"
                    opacity=".5"
                  />
                  <path
                    fill="currentColor"
                    d="M12.18 4.33c1.54 0 2.92.53 4.01 1.57l3-3C17.35 1.2 15 0 12.18 0 8.08 0 4.55 2.04 2.82 5.77l3.49 2.88c.83-2.48 3.14-4.32 5.87-4.32z"
                    opacity=".9"
                  />
                </svg>
                Entrar com Google
              </Button>
            </>
          )}

          <div className="mt-6 space-y-2 text-center text-sm">
            {mode === "signin" && (
              <>
                <button
                  type="button"
                  onClick={() => setMode("recover")}
                  className="block w-full text-muted-foreground hover:text-foreground"
                >
                  Esqueci minha senha
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="block w-full font-medium text-primary hover:underline"
                >
                  Não tem conta? Cadastre-se
                </button>
              </>
            )}
            {mode !== "signin" && (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-medium text-primary hover:underline"
              >
                Voltar para o login
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
