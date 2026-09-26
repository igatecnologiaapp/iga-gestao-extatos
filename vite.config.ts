// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
//
// IMPORTANTE (incidente P0): não redefinir aqui `import.meta.env.VITE_SUPABASE_*`.
// A avaliação deste arquivo ocorre antes da injeção gerenciada do ambiente no build
// publicado, gravando strings vazias no bundle e quebrando o cliente do backend.
// A injeção oficial é feita por @lovable.dev/vite-tanstack-config.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { execSync } from "node:child_process";

// Identificação de versão para /health: SHA real do código no momento do build.
function resolveBuildCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}
const BUILD_COMMIT = resolveBuildCommit();
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  vite: {
    define: {
      __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
