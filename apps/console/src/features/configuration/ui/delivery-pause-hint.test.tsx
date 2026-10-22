// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveryPauseHint } from "#/features/configuration/ui/delivery-pause-hint";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  paused: true,
}));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  appSettingsQueryOptions: () => ({
    queryKey: ["test", "app-settings"],
    queryFn: async () => ({
      deliveryPaused: testState.paused,
      deliveryPausedAt: null,
      rawPayloadRetentionDays: 30,
    }),
    staleTime: Infinity,
  }),
}));

describe("delivery pause hint", () => {
  beforeEach(() => {
    testState.paused = true;
  });

  afterEach(() => {
    cleanup();
  });

  it("says queued actions wait for the resume", async () => {
    renderHint("queued");

    expect((await screen.findByRole("note")).textContent).toContain(
      "queued and only send after resuming",
    );
  });

  it("warns that destination tests send immediately", async () => {
    renderHint("immediate");

    expect((await screen.findByRole("note")).textContent).toContain(
      "bypass the queue and send immediately",
    );
  });

  it("renders nothing while delivery is running", async () => {
    testState.paused = false;

    const { container } = renderHint("immediate");

    await waitFor(() => {
      expect(container.querySelector('[role="note"]')).toBeNull();
    });
  });
});

function renderHint(mode: "queued" | "immediate"): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <AppIntlProvider locale="en-US">
      <QueryClientProvider client={queryClient}>
        <DeliveryPauseHint mode={mode} />
      </QueryClientProvider>
    </AppIntlProvider>,
  );
}
