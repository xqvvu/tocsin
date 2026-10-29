// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DestinationScheduledUrgentNotice } from "#/features/destinations/ui/destination-scheduled-urgent-notice";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  count: 0,
  fail: false,
  calls: 0,
  ids: [] as string[],
}));

vi.mock("#/features/destinations/api/destination.queries", () => ({
  destinationEnablePreviewQueryOptions: (id: string) => {
    testState.ids.push(id);

    return {
      queryKey: ["test", "enable-preview", id],
      queryFn: async () => {
        testState.calls += 1;

        if (testState.fail) {
          throw new Error("preview unavailable");
        }

        return { scheduledUrgentCallCount: testState.count };
      },
      gcTime: 0,
    };
  },
}));

describe("destination scheduled urgent notice", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.count = 0;
    testState.fail = false;
    testState.calls = 0;
    testState.ids = [];
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  function renderNotice(destinationId = "destination-1") {
    return render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <DestinationScheduledUrgentNotice destinationId={destinationId} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );
  }

  it("warns how many calls start dialing once the destination is enabled", async () => {
    testState.count = 3;

    renderNotice();

    expect(
      await screen.findByText("3 queued urgent calls will be dispatched immediately"),
    ).toBeTruthy();
    expect(screen.getByText(/enabling releases them to the urgent-call worker/)).toBeTruthy();
    expect(testState.ids).toEqual(["destination-1"]);
  });

  it("uses the singular form for one queued call", async () => {
    testState.count = 1;

    renderNotice();

    expect(
      await screen.findByText("1 queued urgent call will be dispatched immediately"),
    ).toBeTruthy();
  });

  it("renders nothing when no call is waiting", async () => {
    const { container } = renderNotice();

    await waitFor(() => {
      expect(testState.calls).toBe(1);
      expect(container.textContent).toBe("");
    });
  });

  it("renders nothing when the advisory count fails", async () => {
    testState.fail = true;

    const { container } = renderNotice();

    await waitFor(() => {
      expect(testState.calls).toBe(1);
      expect(container.textContent).toBe("");
    });
  });
});
