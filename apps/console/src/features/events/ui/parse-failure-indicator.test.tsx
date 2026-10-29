// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ParseFailureIndicator } from "#/features/events/ui/parse-failure-indicator";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  total: 0,
  fail: false,
  queryKey: ["test", "parse-failures"],
}));

vi.mock("#/features/operations/api/operations.queries", () => ({
  recentParseFailuresQueryOptions: () => ({
    queryKey: testState.queryKey,
    queryFn: async () => {
      if (testState.fail) {
        throw new Error("operations unavailable");
      }

      return { events: { total: testState.total } };
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
    queryClient.setQueryData(testState.queryKey, { events: { total } });
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale="en-US">
        <ParseFailureIndicator />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}

describe("parse failure indicator", () => {
  afterEach(() => {
    cleanup();
    testState.total = 0;
    testState.fail = false;
  });

  it("shows the rejected count and links to the matching events filter", async () => {
    renderIndicator(2);

    const link = await screen.findByRole("link", { name: "Parse failures: 2" });

    expect(link.getAttribute("href")).toBe("/events?parseFailed=true&range=24h");
    expect(link.getAttribute("title")).toBe(
      "Webhooks received in the last 24 hours include 2 payloads the provider parser rejected — they produced no deliveries",
    );
  });

  it("renders nothing when every payload parsed", async () => {
    const { container } = renderIndicator(0);

    await waitFor(() => {
      expect(container.querySelector("a")).toBeNull();
    });
  });

  it("stays hidden when the parse-failure query fails", async () => {
    testState.fail = true;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <ParseFailureIndicator />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector("a")).toBeNull();
    });
  });
});
