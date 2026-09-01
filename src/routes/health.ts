import { createFileRoute } from "@tanstack/react-router";

const CHECKPOINT_SHA = "49b6b965ea6f1b1b04ede791df2ab1e2f6187a4b";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => {
        const commit =
          process.env["LOVABLE_GIT_COMMIT_SHA"] ??
          process.env["CF_PAGES_COMMIT_SHA"] ??
          process.env["VERCEL_GIT_COMMIT_SHA"] ??
          CHECKPOINT_SHA;
        const build =
          process.env["LOVABLE_DEPLOYMENT_ID"] ??
          process.env["CF_PAGES_BUILD_ID"] ??
          `checkpoint-${CHECKPOINT_SHA.slice(0, 12)}`;

        return Response.json(
          {
            app: "iga-gestao-extatos",
            status: "ok",
            commit,
            build,
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