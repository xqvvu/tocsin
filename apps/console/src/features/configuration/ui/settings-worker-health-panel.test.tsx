// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkerHealthEntry, WorkerHealthOutput } from "@tocsin/api";

import { SettingsWorkerHealthPanel } from "#/features/configuration/ui/settings-worker-health-panel";
import { AppIntlProvider } from "#/i18n/provider";

const NOT_STARTED: WorkerHealthEntry = {
  started: false,
  state: "idle",
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastRun: null,
};

const testState = vi.hoisted(() => ({
  health: null as WorkerHealthOutput | null,
}));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  workerHealthQueryOptions: () => ({
    queryKey: ["test", "worker-health"],
    queryFn: async () => testState.health,
    staleTime: Infinity,
  }),
}));

describe("settings worker health panel", () => {
  afterEach(() => {
    cleanup();
    testState.health = null;
  });

  it("distinguishes a runner that was never assembled", async () => {
    testState.health = { delivery: NOT_STARTED, oncall: NOT_STARTED };

    renderPanel();

    expect(await screen.findAllByText("Not started")).toHaveLength(2);
    expect(screen.getAllByText("Not run yet")).toHaveLength(6);
  });

  it("renders the failed delivery worker and its last run counts", async () => {
    testState.health = {
      delivery: {
        started: true,
        state: "failed",
        lastStartedAt: "2026-10-22T01:00:00.000Z",
        lastFinishedAt: "2026-10-22T01:00:02.000Z",
        lastError: "send failed: target timed out",
        lastRun: {
          claimed: 4,
          reclaimed: 1,
          succeeded: 2,
          failed: 1,
          retrying: 1,
          startedAt: "2026-10-22T01:00:00.000Z",
          finishedAt: "2026-10-22T01:00:02.000Z",
        },
      },
      oncall: {
        ...NOT_STARTED,
        started: true,
        state: "running",
        lastStartedAt: "2026-10-22T01:01:00.000Z",
      },
    };

    renderPanel();

    expect(await screen.findByText("Failed")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(
      screen.getByText("Claimed 4 · reclaimed 1 · succeeded 2 · failed 1 · retrying 1"),
    ).toBeTruthy();
    expect(screen.getByText("send failed: target timed out")).toBeTruthy();
  });

  it("shows a healthy idle worker without an error", async () => {
    testState.health = {
      delivery: {
        started: true,
        state: "idle",
        lastStartedAt: "2026-10-22T01:00:00.000Z",
        lastFinishedAt: "2026-10-22T01:00:01.000Z",
        lastError: null,
        lastRun: {
          claimed: 0,
          reclaimed: 0,
          succeeded: 0,
          failed: 0,
          retrying: 0,
          startedAt: "2026-10-22T01:00:00.000Z",
          finishedAt: "2026-10-22T01:00:01.000Z",
        },
      },
      oncall: NOT_STARTED,
    };

    renderPanel();

    expect(await screen.findByText("Idle")).toBeTruthy();
    expect(screen.getAllByText("No error")).toHaveLength(2);
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
          <SettingsWorkerHealthPanel />
        </Suspense>
      </QueryClientProvider>
    </AppIntlProvider>,
  );
}
