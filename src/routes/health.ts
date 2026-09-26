import { createFileRoute } from "@tanstack/react-router";

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

// SHA gravado no build (git rev-parse HEAD). Sem valor estático de checkpoint.
const BUILD_COMMIT = typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : "unknown";
const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "unknown";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => {
        const commit =
          process.env["LOVABLE_GIT_COMMIT_SHA"] ??
          process.env["CF_PAGES_COMMIT_SHA"] ??
          process.env["VERCEL_GIT_COMMIT_SHA"] ??
          BUILD_COMMIT;
        const build =
          process.env["LOVABLE_DEPLOYMENT_ID"] ??
          process.env["CF_PAGES_BUILD_ID"] ??
          "see x-deployment-id response header";

        return Response.json(
          {
            app: "iga-gestao-extatos",
            status: "ok",
            commit,
            build,
            builtAt: BUILD_TIME,
            backendRuntime: {
              urlConfigured: Boolean(process.env["SUPABASE_URL"]),
              publishableKeyConfigured: Boolean(process.env["SUPABASE_PUBLISHABLE_KEY"]),
            },
          },
          {
            status: 200,
            headers: { "cache-control": "no-store" },
          },
        );
      },
    },
  },
});