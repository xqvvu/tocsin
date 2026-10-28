// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Suppression } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliverySuppressionOutlook } from "#/features/deliveries/ui/delivery-suppression-outlook";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  rules: [] as Suppression[],
  fail: false,
}));

vi.mock("#/features/suppressions/api/suppression.queries", () => ({
  suppressionsQueryOptions: () => ({
    queryKey: ["test", "suppressions"],
    queryFn: async () => {
      if (testState.fail) {
        throw new Error("suppressions unavailable");
      }

      return testState.rules;
    },
    staleTime: Infinity,
  }),
}));

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

// Only Link's destination matters here; a plain anchor keeps this free of a router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? "")} {...rest}>
      {children}
    </a>
  ),
}));

/** The client each test renders with; reassigned per test in `beforeEach`. */
let queryClient: QueryClient;

describe("delivery suppression outlook", () => {
  beforeEach(() => {
    testState.rules = [];
    testState.fail = false;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("says no rule was in force when the delivery was created", async () => {
    renderOutlook(detailFixture());

    expect(await screen.findByText("Not suppressed")).toBeTruthy();
    expect(
      screen.getByText("No suppression rule was in force when this delivery was created"),
    ).toBeTruthy();
    expect(screen.getByText("Suppression decision outlook")).toBeTruthy();
  });

  it("shows the condition that made the closest rule miss", async () => {
    testState.rules = [ruleFixture({ severities: ["critical"] })];

    renderOutlook(detailFixture());

    expect(await screen.findByText("Missed")).toBeTruthy();
    expect(
      screen.getByText("None of the rules in force matched this event, so it was sent normally"),
    ).toBeTruthy();
    // The failing condition is the actionable half of "why did this get through".
    expect(screen.getByText("expected Critical, event carried Warning")).toBeTruthy();
  });

  it("warns when today's rule definition would now match the past delivery", async () => {
    testState.rules = [ruleFixture({ severities: ["warning"] })];

    renderOutlook(detailFixture());

    expect(await screen.findByText("Would match under current rules")).toBeTruthy();
    expect(
      screen.getByText(
        "Replaying the current rule definition, this rule would now match — the rule may have changed after the delivery",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Matched")).toBeTruthy();
  });

  it("ignores rules that were not in force at delivery creation", async () => {
    // Window opened after the delivery was created, so it cannot explain anything.
    testState.rules = [
      ruleFixture({
        severities: ["warning"],
        startsAt: "2026-10-12T11:00:00.000Z",
        endsAt: "2026-10-12T12:00:00.000Z",
      }),
    ];

    renderOutlook(detailFixture());

    expect(
      await screen.findByText("No suppression rule was in force when this delivery was created"),
    ).toBeTruthy();
    expect(screen.getByText(/0 rules in force/)).toBeTruthy();
  });

  it("orders the closest miss first so the likely suspect is on top", async () => {
    testState.rules = [
      ruleFixture({
        id: "suppression-far",
        name: "Far miss",
        severities: ["critical"],
        statuses: ["resolved"],
      }),
      ruleFixture({ id: "suppression-near", name: "Near miss", severities: ["critical"] }),
    ];

    const { container } = renderOutlook(detailFixture());

    await screen.findByText("Near miss");
    const text = container.textContent ?? "";
    expect(text.indexOf("Near miss")).toBeLessThan(text.indexOf("Far miss"));
  });

  it("does not replay against a redacted event", async () => {
    renderOutlook(
      detailFixture({
        event: { title: "Disk [REDACTED]", message: "disk usage 92%" },
      }),
    );

    expect(
      await screen.findByText(
        "Event content was redacted, so the suppression decision cannot be replayed reliably",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Not suppressed")).toBeNull();
  });

  it("reports a read failure instead of claiming nothing was in force", async () => {
    testState.fail = true;

    renderOutlook(detailFixture());

    expect(
      await screen.findByText(
        "Could not read suppression rules, so the decision cannot be replayed",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("No suppression rule was in force when this delivery was created"),
    ).toBeNull();
  });
});

function renderOutlook(detail: DeliveryDetailData) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AppIntlProvider locale="en-US">
        <DeliverySuppressionOutlook detail={detail} />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}

function detailFixture(overrides: { event?: { title: string; message: string } } = {}) {
  return {
    job: {
      id: "delivery-1",
      eventId: "event-1",
      destinationId: "destination-1",
      routeId: "route-1",
      state: "succeeded",
      attemptCount: 1,
      maxAttempts: 5,
      nextAttemptAt: null,
      lastError: null,
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      createdAt: "2026-10-12T10:00:00.000Z",
      updatedAt: "2026-10-12T10:00:05.000Z",
      finishedAt: "2026-10-12T10:00:05.000Z",
    },
    event: {
      id: "event-1",
      sourceId: "source-1",
      normalized: {
        title: overrides.event?.title ?? "Disk almost full",
        message: overrides.event?.message ?? "disk usage 92%",
        severity: "warning",
        status: "firing",
        fingerprint: "disk-full",
        labels: {},
        fields: {},
        links: [],
      },
      rawPayload: {},
      rawHeaders: {},
      receivedAt: "2026-10-12T09:59:59.000Z",
      providerMetadata: {},
    },
  } as unknown as DeliveryDetailData;
}

function ruleFixture(
  overrides: {
    id?: string;
    name?: string;
    severities?: Suppression["matcher"]["severities"];
    statuses?: Suppression["matcher"]["statuses"];
    startsAt?: string;
    endsAt?: string;
  } = {},
): Suppression {
  return {
    id: overrides.id ?? "suppression-1",
    name: overrides.name ?? "October database migration",
    kind: "maintenance_window",
    enabled: true,
    reason: null,
    matcher: {
      sourceIds: [],
      destinationIds: [],
      severities: overrides.severities ?? [],
      statuses: overrides.statuses ?? [],
      labels: [],
      titleContains: [],
      messageContains: [],
      fingerprints: [],
    },
    startsAt: overrides.startsAt ?? "2026-10-12T09:00:00.000Z",
    endsAt: overrides.endsAt ?? "2026-10-12T11:00:00.000Z",
    createdBy: null,
    createdAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-12T08:00:00.000Z",
  };
}
