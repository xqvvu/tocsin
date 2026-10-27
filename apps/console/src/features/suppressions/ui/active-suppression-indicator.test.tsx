// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Suppression, SuppressionMatcher } from "@tocsin/core";

import { ActiveSuppressionIndicator } from "#/features/suppressions/ui/active-suppression-indicator";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  suppressions: [] as unknown[],
  fail: false,
}));

vi.mock("#/features/suppressions/api/suppression.queries", () => ({
  suppressionsQueryOptions: () => ({
    queryKey: ["test", "suppressions"],
    queryFn: async () => {
      if (testState.fail) {
        throw new Error("suppressions unavailable");
      }

      return testState.suppressions;
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
    // Serialize the typed search object the way the real Link does, so the test
    // can assert the badge drills into the active-rules view.
    const query = search ? `?${new URLSearchParams(Object.entries(search)).toString()}` : "";

    return (
      <a href={`${to}${query}`} {...props}>
        {children}
      </a>
    );
  },
}));

/**
 * The component reads the real clock on mount, so fixture windows are anchored
 * to test start instead of a fixed date; a hard-coded window would silently
 * expire and turn the "active" cases into no-ops.
 */
const BASE = Date.now();

function at(offsetMinutes: number): string {
  return new Date(BASE + offsetMinutes * 60_000).toISOString();
}

function matcher(overrides: Partial<SuppressionMatcher> = {}): SuppressionMatcher {
  return {
    sourceIds: [],
    destinationIds: [],
    severities: [],
    statuses: [],
    fingerprints: [],
    labels: [],
    titleContains: [],
    messageContains: [],
    ...overrides,
  };
}

function suppression(overrides: Partial<Suppression> = {}): Suppression {
  return {
    id: "suppression-1",
    name: "Database migration",
    kind: "maintenance_window",
    enabled: true,
    reason: null,
    matcher: matcher(),
    startsAt: at(-60),
    endsAt: at(60),
    createdBy: null,
    createdAt: at(-120),
    updatedAt: at(-120),
    ...overrides,
  };
}

function renderIndicator(suppressions: Suppression[]) {
  testState.suppressions = suppressions;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["test", "suppressions"], suppressions);

  return render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale="en-US">
        <ActiveSuppressionIndicator />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}

describe("active suppression indicator", () => {
  afterEach(() => {
    cleanup();
    testState.suppressions = [];
    testState.fail = false;
  });

  it("renders nothing when no rule is in force", async () => {
    const { container } = renderIndicator([
      suppression({
        id: "scheduled",
        startsAt: at(30),
        endsAt: at(120),
      }),
      suppression({
        id: "expired",
        startsAt: at(-120),
        endsAt: at(-30),
      }),
      suppression({ id: "disabled", enabled: false }),
    ]);

    await waitFor(() => {
      expect(container.querySelector("a")).toBeNull();
    });
  });

  it("counts active rules and links to the filtered active rules list", async () => {
    renderIndicator([
      suppression({
        id: "first",
        name: "Database migration",
        matcher: matcher({ sourceIds: ["source-1"] }),
      }),
      suppression({
        id: "second",
        name: "Network maintenance",
        matcher: matcher({ severities: ["critical"] }),
      }),
      suppression({
        id: "scheduled",
        startsAt: at(30),
        endsAt: at(120),
      }),
    ]);

    const link = await screen.findByRole("link", { name: "Active suppressions: 2" });

    // Opening the bare list could land on a page of expired rules even while a
    // rule is silencing alerts, so the badge carries the state filter.
    expect(link.getAttribute("href")).toBe("/suppressions?state=active");
    expect(link.getAttribute("title")).toBe("Database migration · Network maintenance");
  });

  it("warns explicitly when a catch-all rule is in force", async () => {
    renderIndicator([
      suppression({ id: "catch-all", name: "Freeze" }),
      suppression({
        id: "scoped",
        matcher: matcher({ sourceIds: ["source-1"] }),
      }),
    ]);

    expect(await screen.findByRole("link", { name: "All alerts are silenced" })).toBeTruthy();
  });

  it("says when an active silence is about to expire", async () => {
    renderIndicator([
      suppression({
        id: "ending",
        name: "Database migration",
        endsAt: at(15),
        matcher: matcher({ sourceIds: ["source-1"] }),
      }),
      suppression({
        id: "steady",
        name: "Network maintenance",
        matcher: matcher({ severities: ["critical"] }),
      }),
    ]);

    expect(
      await screen.findByRole("link", {
        name: "Active suppressions: 2 · 1 expiring within 30 min",
      }),
    ).toBeTruthy();
  });

  it("adds the expiry warning to a catch-all rule too", async () => {
    renderIndicator([suppression({ id: "catch-all", name: "Freeze", endsAt: at(5) })]);

    expect(
      await screen.findByRole("link", {
        name: "All alerts are silenced · 1 expiring within 30 min",
      }),
    ).toBeTruthy();
  });

  it("collapses its text below the sm breakpoint while keeping the full name", async () => {
    renderIndicator([
      suppression({
        id: "ending",
        name: "Database migration",
        endsAt: at(15),
        matcher: matcher({ sourceIds: ["source-1"] }),
      }),
    ]);

    const link = await screen.findByRole("link", {
      name: "Active suppressions: 1 · 1 expiring within 30 min",
    });

    // The pause and failure indicators already hide their text below `sm`; the
    // silence badge used to keep its full sentence and overflowed the bar.
    expect(link.getAttribute("aria-label")).toBe(
      "Active suppressions: 1 · 1 expiring within 30 min",
    );
    expect(collapsedSpans(link)).toHaveLength(2);
  });

  it("stays hidden when the suppression query fails", async () => {
    testState.fail = true;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <ActiveSuppressionIndicator />
        </AppIntlProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector("a")).toBeNull();
    });
  });
});

function collapsedSpans(link: HTMLElement): HTMLSpanElement[] {
  return Array.from(link.querySelectorAll("span")).filter((span) =>
    span.classList.contains("hidden"),
  );
}
