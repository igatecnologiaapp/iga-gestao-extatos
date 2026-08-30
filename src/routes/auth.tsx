import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/domain";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Entrar — ${APP_NAME}` },
      {
        name: "description",
        content: "Acesse sua conta para gerenciar os dados financeiros da sua empresa.",
      },
      { property: "og:title", content: `Entrar — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Acesse sua conta para gerenciar os dados financeiros da sua empresa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiagnosticAuthPage,
});

function DiagnosticAuthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-sm text-center">
        <h1 className="font-display text-3xl font-bold text-foreground">Gestão de Extratos</h1>
        <p className="mt-3 text-base text-muted-foreground">Sistema disponível</p>
        <Button type="button" className="mt-7 w-full">
          Entrar
        </Button>
      </section>
    </main>
  );
}