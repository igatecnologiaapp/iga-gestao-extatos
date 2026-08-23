import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { provisionCompany } from "@/lib/members.functions";
import { APP_NAME } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: `Criar empresa — ${APP_NAME}` },
      { name: "description", content: "Provisione a empresa para começar a usar o sistema." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const provision = useServerFn(provisionCompany);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await provision({ data: { name, document: document || undefined } });
      await queryClient.invalidateQueries({ queryKey: ["memberships"] });
      toast.success("Empresa criada com sucesso. Você é o administrador.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a empresa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Landmark className="h-5 w-5" />
          </div>
          <p className="font-display text-base font-bold text-foreground">{APP_NAME}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold text-foreground">
            Crie sua empresa
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos os dados financeiros ficam vinculados a uma empresa, com isolamento total
            entre empresas. Você será o administrador.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome da empresa</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                placeholder="Ex.: Empresa Demonstração Ltda."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="document">CNPJ (opcional)</Label>
              <Input
                id="document"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar empresa e começar
            </Button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Ao criar a empresa, serão configurados automaticamente os papéis de acesso e as
            categorias financeiras iniciais (Compra, Taxa e Juros).
          </p>
        </div>
      </div>
    </div>
  );
}
