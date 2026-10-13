import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E configuration.
 *
 * Deliberately not part of the unit-test run: a browser suite is an order of
 * magnitude slower, so it lives behind its own command (`just e2e`) and its own
 * workflow. The webServer block starts the real app against a throwaway SQLite
 * file so the spec exercises first-run setup rather than a pre-seeded database.
 */
const port = Number(process.env.TOCSIN_E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "./e2e",
  // A fresh database per run: the spec asserts first-run setup, which only
  // exists on an empty instance. `e2e/global-setup.ts` removes it.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // One worker: the spec mutates shared server state (creating the owner
  // account), so parallel workers would race for "first user wins".
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Keep failures debuggable from CI without a re-run.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vp -C apps/console dev --port ${port} --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: "../..",
    env: {
      TOCSIN_DATABASE_PATH: e2eDatabasePath(),
      BETTER_AUTH_SECRET: "e2e-secret-not-used-anywhere-else-000000000000",
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    },
  },
});

/** Shared by globalSetup and the webServer env, so both name the same file. */
export function e2eDatabasePath(): string {
  return process.env.TOCSIN_E2E_DATABASE_PATH ?? "/tmp/tocsin-e2e.sqlite";
}
