import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";

export type PublicBackendConfig = {
  url: string;
  publishableKey: string;
};

declare global {
  interface Window {
    __IGA_BACKEND_CONFIG__?: PublicBackendConfig;
  }
}

function createBackendClient() {
  const config = typeof window !== "undefined" ? window.__IGA_BACKEND_CONFIG__ : undefined;
  if (!config?.url || !config.publishableKey) {
    throw new Error("A configuração pública do backend não foi carregada antes da aplicação.");
  }

  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let backendClient: ReturnType<typeof createBackendClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createBackendClient>, {
  get(_, prop, receiver) {
    if (!backendClient) backendClient = createBackendClient();
    return Reflect.get(backendClient, prop, receiver);
  },
});