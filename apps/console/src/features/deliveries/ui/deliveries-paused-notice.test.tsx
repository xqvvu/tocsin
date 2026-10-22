// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveriesPausedNotice } from "#/features/deliveries/ui/deliveries-paused-notice";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  paused: true,
  queries: 0,
  backlogQueries: 0,
  backlog: {
    claimable: 3,
    oldestCreatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  } as { claimable: number; oldestCreatedAt: string | null },
  mutateAsync: vi.fn<(input: unknown) => Promise<unknown>>(),
  toast: {
    success: vi.fn<(title: string) => void>(),
    error: vi.fn<(title: string, options?: { description?: string }) => void>(),
  },
}));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  appSettingsQueryOptions: () => ({
    queryKey: ["test", "app-settings"],
    queryFn: async () => {
      testState.queries += 1;

      return {
        deliveryPaused: testState.paused,
        deliveryPausedAt: null,
        rawPayloadRetentionDays: 30,
      };
    },
    staleTime: Infinity,
  }),
}));

vi.mock("#/features/operations/api/operations.queries", () => ({
  deliveryBacklogQueryOptions: () => ({
    queryKey: ["test", "delivery-backlog"],
    queryFn: async () => {
      testState.backlogQueries += 1;

      return testState.backlog;
    },
    staleTime: Infinity,
  }),
}));

vi.mock("#/features/configuration/api/use-app-settings-mutation", () => ({
  useAppSettingsMutation: () => ({
    mutateAsync: testState.mutateAsync,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({ toast: testState.toast }));

describe("deliveries paused notice", () => {
  afterEach(() => {
    cleanup();
    testState.paused = true;
    testState.queries = 0;
    testState.backlogQueries = 0;
    testState.backlog = {
      claimable: 3,
      oldestCreatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    };
    testState.mutateAsync.mockReset();
    testState.toast.success.mockClear();
    testState.toast.error.mockClear();
  });

  it("stays hidden while delivery is running", async () => {
    testState.paused = false;

    renderNotice();

    await waitFor(() => {
      expect(testState.queries).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Outbound delivery is paused")).toBeNull();
    // The backlog projection is paused-only: a running queue must not fetch it.
    expect(testState.backlogQueries).toBe(0);
  });

  it("shows how much the worker will claim when resuming", async () => {
    renderNotice();

    expect(
      await screen.findByText(/3 queued deliveries will be claimed immediately after resuming/),
    ).toBeTruthy();
    expect(screen.getByText(/oldest waiting/)).toBeTruthy();
    expect(testState.backlogQueries).toBeGreaterThan(0);
  });

  it("says when nothing is claimable", async () => {
    testState.backlog = { claimable: 0, oldestCreatedAt: null };

    renderNotice();

    expect(await screen.findByText("No queued deliveries are ready to be claimed")).toBeTruthy();
    expect(screen.queryByText(/will be claimed immediately/)).toBeNull();
  });

  it("discloses resumed urgent paging before resuming", async () => {
    testState.mutateAsync.mockResolvedValue({});

    renderNotice();

    fireEvent.click(await screen.findByRole("button", { name: "Resume delivery" }));

    expect(await screen.findByText("Resume outbound delivery?")).toBeTruthy();
    expect(
      screen.getByText(/Feishu app-mode destinations with automatic urgent paging/),
    ).toBeTruthy();
    expect(screen.getByText(/urgent paging is not paused/)).toBeTruthy();
    expect(testState.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Resume and send" }));

    await waitFor(() => {
      expect(testState.mutateAsync).toHaveBeenCalledWith({
        deliveryPaused: false,
      });
    });
    await waitFor(() => {
      expect(testState.toast.success).toHaveBeenCalledWith("Outbound delivery resumed");
    });
  });

  it("keeps the dialog open when resuming fails", async () => {
    testState.mutateAsync.mockRejectedValue(new Error("settings unavailable"));

    renderNotice();

    fireEvent.click(await screen.findByRole("button", { name: "Resume delivery" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resume and send" }));

    await waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith("Failed to resume delivery", {
        description: "settings unavailable",
      });
    });
    expect(screen.getByText("Resume outbound delivery?")).toBeTruthy();
    expect(testState.toast.success).not.toHaveBeenCalled();
  });
});

function renderNotice(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <AppIntlProvider locale="en-US">
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <DeliveriesPausedNotice />
        </Suspense>
      </QueryClientProvider>
    </AppIntlProvider>,
  );
}
