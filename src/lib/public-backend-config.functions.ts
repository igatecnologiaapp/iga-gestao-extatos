import { createServerFn } from "@tanstack/react-start";

export const getPublicBackendConfig = createServerFn({ method: "GET" }).handler(() => {
  const url = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !publishableKey) {
    throw new Error("A configuração pública do backend não está disponível no runtime.");
  }

  return { url, publishableKey };
});