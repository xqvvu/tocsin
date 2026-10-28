// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { RuntimeInformation } from "@tocsin/api";

import { SettingsRuntimePanel } from "#/features/configuration/ui/settings-runtime-panel";
import { AppIntlProvider } from "#/i18n/provider";

const RUNTIME: RuntimeInformation = {
  version: "0.1.0-beta.122",
  nodeVersion: "v26.12.0",
  platform: "linux",
  architecture: "arm64",
  environment: "production",
  publicBaseUrl: null,
  sqliteDriver: "better-sqlite3",
  sqliteVersion: "3.53.0",
  destinationTimeoutMs: 10_000,
  maxWebhookBytes: 1024 * 1024,
  workerBatchSize: 10,
  workerIntervalMs: 5_000,
  workerStaleRunningMs: 300_000,
  logFormat: "auto",
  logLevel: "info",
};

const testState = vi.hoisted(() => ({
  runtime: null as RuntimeInformation | null,
}));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  runtimeInformationQueryOptions: () => ({
    queryKey: ["test", "runtime-information"],
    queryFn: async () => testState.runtime,
    staleTime: Infinity,
  }),
}));

describe("settings runtime panel", () => {
  afterEach(() => {
    cleanup();
    testState.runtime = null;
  });

  it("warns that notification links cannot be built without a base URL", async () => {
    testState.runtime = RUNTIME;

    renderPanel();

    expect(await screen.findByText("Notification links cannot be built")).toBeTruthy();
    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("warns when the base URL is the local Compose default", async () => {
    testState.runtime = { ...RUNTIME, publicBaseUrl: "http://localhost:3000" };

    renderPanel();

    expect(await screen.findByText("Notification links point at this host")).toBeTruthy();
    expect(
      screen.getByText(/The base http:\/\/localhost:3000 only opens on the console host/),
    ).toBeTruthy();
  });

  it("keeps a public base URL free of warnings", async () => {
    testState.runtime = { ...RUNTIME, publicBaseUrl: "https://tocsin.example.test" };

    renderPanel();

    expect(await screen.findByText("https://tocsin.example.test")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <AppIntlProvider locale="en-US">
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <SettingsRuntimePanel />
        </Suspense>
      </QueryClientProvider>
    </AppIntlProvider>,
  );
}
