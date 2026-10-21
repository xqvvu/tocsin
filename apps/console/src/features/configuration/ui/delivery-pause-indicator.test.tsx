// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveryPauseIndicator } from "#/features/configuration/ui/delivery-pause-indicator";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({ paused: false, fail: false, calls: 0 }));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  appSettingsQueryOptions: () => ({
    queryKey: ["test", "app-settings", testState.paused, testState.fail],
    queryFn: async () => {
      testState.calls += 1;

      if (testState.fail) {
        throw new Error("settings unavailable");
      }

      return {
        deliveryPaused: testState.paused,
        deliveryPausedAt: null,
        rawPayloadRetentionDays: 30,
      };
    },
    staleTime: Infinity,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("delivery pause indicator", () => {
  afterEach(() => {
    cleanup();
    testState.paused = false;
    testState.fail = false;
    testState.calls = 0;
  });

  it("links to the deliveries page while outbound delivery is paused", async () => {
    testState.paused = true;

    renderIndicator();

    const link = await screen.findByRole("link", { name: "Outbound delivery is paused" });
    expect(link.getAttribute("href")).toBe("/deliveries");
    expect(link.textContent).toContain("Outbound delivery is paused");
  });

  it("stays hidden when delivery is running", async () => {
    renderIndicator();

    await flushQueries();

    expect(screen.queryByRole("link", { name: "Outbound delivery is paused" })).toBeNull();
  });

  it("stays hidden when the settings query fails", async () => {
    testState.fail = true;

    renderIndicator();

    await flushQueries();

    expect(screen.queryByRole("link", { name: "Outbound delivery is paused" })).toBeNull();
  });
});

function renderIndicator(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <AppIntlProvider locale="en-US">
      <QueryClientProvider client={queryClient}>
        <DeliveryPauseIndicator />
      </QueryClientProvider>
    </AppIntlProvider>,
  );
}

/** Let the settings query settle so "hidden" assertions run after resolution. */
async function flushQueries(): Promise<void> {
  await waitFor(() => {
    expect(testState.calls).toBeGreaterThan(0);
  });
}
