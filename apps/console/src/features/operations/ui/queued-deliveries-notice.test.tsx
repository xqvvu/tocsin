// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { QueuedDeliveriesNotice } from "#/features/operations/ui/queued-deliveries-notice";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  total: 0,
  fail: false,
  scopes: [] as unknown[],
}));

vi.mock("#/features/operations/api/operations.queries", () => ({
  pendingDeliveriesQueryOptions: (scope: unknown) => {
    testState.scopes.push(scope);

    return {
      queryKey: ["test", "pending-deliveries", scope],
      queryFn: async () => {
        if (testState.fail) {
          throw new Error("operations unavailable");
        }

        return { deliveries: { total: testState.total } };
      },
      staleTime: Infinity,
    };
  },
}));

describe("queued deliveries notice", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.total = 0;
    testState.fail = false;
    testState.scopes = [];
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  function renderNotice(scope: { sourceId?: string; routeId?: string; destinationId?: string }) {
    return render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <QueuedDeliveriesNotice scope={scope} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );
  }

  it("renders the pluralized count and forwards the scope", async () => {
    testState.total = 3;

    renderNotice({ destinationId: "destination-1" });

    expect(await screen.findByText("3 queued deliveries")).toBeTruthy();
    expect(testState.scopes).toEqual([{ destinationId: "destination-1" }]);
  });

  it("uses the singular form for one queued delivery", async () => {
    testState.total = 1;

    renderNotice({ routeId: "route-1" });

    expect(await screen.findByText("1 queued delivery")).toBeTruthy();
  });

  it("states explicitly when nothing is queued", async () => {
    renderNotice({ sourceId: "source-1" });

    expect(await screen.findByText("No queued deliveries")).toBeTruthy();
  });

  it("renders nothing when the advisory count fails", async () => {
    testState.fail = true;

    const { container } = renderNotice({ sourceId: "source-1" });

    await waitFor(() => {
      expect(container.textContent).toBe("");
    });
  });
});
