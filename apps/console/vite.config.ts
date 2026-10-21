import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

const config = defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },

  plugins: lazyPlugins(() => [
    devtools(),
    tailwindcss(),
    tanstackStart({
      router: {
        semicolons: true,
        quoteStyle: "double",
        generatedRouteTree: path.join(import.meta.dirname, "src/route-tree.gen.ts"),
      },
      importProtection: {
        behavior: "error",
      },
    }),
    // Nitro v2 produces the `.output/server` that Docker runs. Unlike the Nitro
    // v3 Vite plugin, this one only hooks `build`, so it stays out of the
    // `serve` command Vitest reports and needs no `VITEST` guard.
    nitroV2Plugin({
      compatibilityDate: "2026-10-21",
      sourceMap: true,
    }),
    viteReact(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ]),

  test: {
    // The browser suite lives under `e2e/` and drives a real server through
    // Playwright. Vitest's default include globs would otherwise collect these
    // specs and fail them for lack of a browser, so they are excluded here and
    // run by their own command (`just e2e`).
    exclude: ["**/node_modules/**", "**/dist/**", "**/.output/**", "e2e/**"],
  },

  build: {
    chunkSizeWarningLimit: 1024,
  },

  server: {
    port: 6180,
    strictPort: true,
    host: true,
  },
}));

export default config;
