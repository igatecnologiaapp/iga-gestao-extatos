import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { CompanyProvider } from "@/lib/company-context";

// Layout de rotas protegidas (gerenciado pela integração):
// SSR desligado porque a sessão fica no armazenamento local do navegador;
// o gate redireciona para /auth quando não há usuário autenticado.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <CompanyProvider>
      <Outlet />
    </CompanyProvider>
  );
}
