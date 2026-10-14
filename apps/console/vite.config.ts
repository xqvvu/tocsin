import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
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
    // nitro produces the `.output/server` that Docker runs. Its Vite plugin also
    // activates for every `serve` command, which is what Vitest reports, so a
    // test run would load nitro's environments and dev middleware for nothing
    // and log a `ReferenceError: module is not defined` from React's CJS entry.
    // `VITEST` is set by the runner itself, so this holds for
    // `vp test --mode <anything>`. Upstream: nitrojs/nitro#3659, #4144.
    !process.env.VITEST &&
      nitro({
        sourcemap: true,
        wasm: { silent: true },
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
