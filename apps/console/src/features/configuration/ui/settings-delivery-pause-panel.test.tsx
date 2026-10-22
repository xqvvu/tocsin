// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SettingsDeliveryPausePanel } from "#/features/configuration/ui/settings-delivery-pause-panel";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  paused: true,
  pausedAt: null as string | null,
  pausedBy: null as string | null,
  lastPause: null as {
    startedAt: string;
    endedAt: string;
    pausedBy: string | null;
    resumedBy: string | null;
  } | null,
  queries: 0,
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
        deliveryPausedAt: testState.pausedAt,
        deliveryPausedBy: testState.pausedBy,
        lastDeliveryPause: testState.lastPause,
        rawPayloadRetentionDays: 30,
      };
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

describe("settings delivery pause panel", () => {
  afterEach(() => {
    cleanup();
    testState.paused = true;
    testState.pausedAt = null;
    testState.pausedBy = null;
    testState.lastPause = null;
    testState.queries = 0;
    testState.mutateAsync.mockReset();
    testState.toast.success.mockClear();
    testState.toast.error.mockClear();
  });

  it("pauses immediately without a confirmation step", async () => {
    testState.paused = false;
    testState.mutateAsync.mockResolvedValue({});

    renderPanel();

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(testState.mutateAsync).toHaveBeenCalledWith({
        deliveryPaused: true,
      });
    });
    expect(screen.queryByText("Resume outbound delivery?")).toBeNull();
  });

  it("does not resume until the urgent paging impact is confirmed", async () => {
    testState.mutateAsync.mockResolvedValue({});

    renderPanel();

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    expect(await screen.findByText("Resume outbound delivery?")).toBeTruthy();
    expect(screen.getByText(/will call receivers again/)).toBeTruthy();
    expect(testState.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep paused" }));

    await waitFor(() => {
      expect(screen.queryByText("Resume outbound delivery?")).toBeNull();
    });
    expect(testState.mutateAsync).not.toHaveBeenCalled();
  });

  it("names the operator who started the current pause", async () => {
    testState.pausedAt = "2026-06-01T10:00:00.000Z";
    testState.pausedBy = "oncall@example.test";

    renderPanel();

    expect(await screen.findByText(/Paused since .* by oncall@example\.test/)).toBeTruthy();
  });

  it("shows the last completed pause interval once delivery is running", async () => {
    testState.paused = false;
    testState.lastPause = {
      startedAt: "2026-06-01T10:00:00.000Z",
      endedAt: "2026-06-01T10:30:00.000Z",
      pausedBy: "oncall@example.test",
      resumedBy: "lead@example.test",
    };

    renderPanel();

    expect(await screen.findByText(/Last pause: .+ – .+ by oncall@example\.test/)).toBeTruthy();
  });

  it("keeps the last pause readable when the operator is unknown", async () => {
    testState.paused = false;
    testState.lastPause = {
      startedAt: "2026-06-01T10:00:00.000Z",
      endedAt: "2026-06-01T10:30:00.000Z",
      pausedBy: null,
      resumedBy: null,
    };

    renderPanel();

    expect(await screen.findByText(/Last pause: .+ – .+$/)).toBeTruthy();
  });

  it("resumes after confirmation", async () => {
    testState.mutateAsync.mockResolvedValue({});

    renderPanel();

    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(await screen.findByRole("button", { name: "Resume and send" }));

    await waitFor(() => {
      expect(testState.mutateAsync).toHaveBeenCalledWith({
        deliveryPaused: false,
      });
    });
    await waitFor(() => {
      expect(testState.toast.success).toHaveBeenCalledWith("Outbound delivery resumed");
    });
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
          <SettingsDeliveryPausePanel />
        </Suspense>
      </QueryClientProvider>
    </AppIntlProvider>,
  );
}
