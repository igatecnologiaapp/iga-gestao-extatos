import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Landmark, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { lovable } from "@/integrations/lovable";
import { supabase } from "@/lib/backend-client";
import { APP_NAME } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `Entrar — ${APP_NAME}` },
      { name: "description", content: "Acesse sua conta para gerenciar extratos, contas e cartões da sua empresa." },
      { property: "og:title", content: `Entrar — ${APP_NAME}` },
      { property: "og:description", content: "Acesse sua conta para gerenciar extratos, contas e cartões da sua empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/" });
      else setCheckingSession(false);
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: validated, error: validationError } = await supabase.auth.getUser();
        if (validationError || !validated.user) throw validationError ?? new Error("A sessão não pôde ser validada.");
        await navigate({ to: "/" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` });
        if (error) throw error;
        toast.success("Enviamos um link de recuperação para o seu e-mail.");
        setMode("signin");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao entrar com Google.");
      setBusy(false);
    }
  }

  if (checkingSession) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Landmark className="h-5 w-5" /></div>
          <div><p className="font-display text-base font-bold text-sidebar-accent-foreground">{APP_NAME}</p><p className="text-xs text-sidebar-foreground/60">finanças empresariais</p></div>
        </div>
        <div className="max-w-md">
          <h1 className="font-display text-3xl font-bold leading-tight text-sidebar-accent-foreground">Extratos e faturas organizados, com rastreabilidade total.</h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/75">Centralize contas bancárias e cartões em um ambiente seguro, multiempresa e auditável — pronto para importação de extratos, conciliação e análise de custos.</p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-sidebar-primary" />Isolamento por empresa com segurança em nível de banco de dados</li>
            <li className="flex items-center gap-3"><Lock className="h-4 w-4 text-sidebar-primary" />Documentos em armazenamento privado e dados sensíveis protegidos</li>
            <li className="flex items-center gap-3"><Building2 className="h-4 w-4 text-sidebar-primary" />Perfis de acesso: Administrador, Financeiro, Consulta e Auditor</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/45">Seus dados financeiros nunca ficam em buckets públicos.</p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Landmark className="h-5 w-5" /></div><p className="font-display text-base font-bold text-foreground">{APP_NAME}</p></div>
          <h2 className="font-display text-2xl font-bold text-foreground">{mode === "signin" ? "Entrar na sua conta" : mode === "signup" ? "Criar sua conta" : "Recuperar senha"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "signin" ? "Acesse o painel da sua empresa." : mode === "signup" ? "Cadastre-se para provisionar sua empresa." : "Enviaremos um link para redefinir sua senha."}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && <div className="space-y-1.5"><Label htmlFor="fullName">Nome completo</Label><Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" /></div>}
            <div className="space-y-1.5"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div>
            {mode !== "recover" && <div className="space-y-1.5"><Label htmlFor="password">Senha</Label><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></div>}
            <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link de recuperação"}</Button>
          </form>

          {mode !== "recover" && <><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />ou<div className="h-px flex-1 bg-border" /></div><Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>Entrar com Google</Button></>}
          <div className="mt-6 space-y-2 text-center text-sm">
            {mode === "signin" ? <><Button type="button" variant="link" onClick={() => setMode("recover")} className="h-auto w-full text-muted-foreground">Esqueci minha senha</Button><Button type="button" variant="link" onClick={() => setMode("signup")} className="h-auto w-full">Não tem conta? Cadastre-se</Button></> : <Button type="button" variant="link" onClick={() => setMode("signin")}>Voltar para o login</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}