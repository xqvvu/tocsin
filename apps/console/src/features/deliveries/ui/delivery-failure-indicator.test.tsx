// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveryFailureIndicator } from "#/features/deliveries/ui/delivery-failure-indicator";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  total: 0,
  fail: false,
  queryKey: ["test", "failed-deliveries"],
}));

vi.mock("#/features/operations/api/operations.queries", () => ({
  failedDeliveriesQueryOptions: () => ({
    queryKey: testState.queryKey,
    queryFn: async () => {
      if (testState.fail) {
        throw new Error("operations unavailable");
      }

      return { deliveries: { total: testState.total } };
    },
    staleTime: Infinity,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    search?: Record<string, string>;
  }) => {
    const query = search ? `?${new URLSearchParams(search).toString()}` : "";

    return (
      <a href={`${to}${query}`} {...props}>
        {children}
      </a>
    );
  },
}));

function renderIndicator(total: number) {
  testState.total = total;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (!testState.fail) {
    queryClient.setQueryData(testState.queryKey, { deliveries: { total } });
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale="en-US">
        <DeliveryFailureIndicator />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}

describe("delivery failure indicator", () => {
  afterEach(() => {
    cleanup();
    testState.total = 0;
    testState.fail = false;
  });

  it("shows the failed count and links to the matching delivery filter", async () => {
    renderIndicator(3);

    const link = await screen.findByRole("link", { name: "Failed deliveries: 3" });

    expect(link.getAttribute("href")).toBe("/deliveries?deliveryState=failed&range=24h");
    expect(link.getAttribute("title")).toBe(
      "Deliveries created in the last 24 hours include 3 failed",
    );
  });

  it("renders nothing when nothing failed", async () => {
    const { container } = renderIndicator(0);

    await waitFor(() => {
      expect(container.querySelector("a")).toBeNull();
    });
  });

  it("stays hidden when the failure query fails", async () => {
    testState.fail = true;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <DeliveryFailureIndicator />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector("a")).toBeNull();
    });
  });
});
