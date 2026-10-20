// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Suppression } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliverySuppressionChecks } from "#/features/deliveries/ui/delivery-suppression-checks";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  rule: null as Suppression | null,
  fail: false,
  requestedIds: [] as string[],
}));

vi.mock("#/features/suppressions/api/suppression.queries", () => ({
  suppressionQueryOptions: (id: string) => ({
    queryKey: ["test", "suppression", id],
    queryFn: async () => {
      testState.requestedIds.push(id);

      if (testState.fail) {
        throw new Error("suppression unavailable");
      }

      return testState.rule;
    },
    staleTime: Infinity,
  }),
}));

describe("delivery suppression checks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.rule = ruleFixture(["critical"]);
    testState.fail = false;
    testState.requestedIds = [];
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  function renderChecks(detail: DeliveryDetailData) {
    return render(
      <QueryClientProvider client={queryClient}>
        <AppIntlProvider locale="en-US">
          <DeliverySuppressionChecks detail={detail} />
        </AppIntlProvider>
      </QueryClientProvider>,
    );
  }

  it("renders the per-condition evidence from the current rule", async () => {
    renderChecks(detailFixture({ suppressionId: "suppression-1" }));

    expect(await screen.findByText("Match checks (current rule)")).toBeTruthy();
    expect(screen.getByText("Matched")).toBeTruthy();
    expect(screen.getByText("Severity")).toBeTruthy();
    expect(screen.getByText("expected Critical, event carried Critical")).toBeTruthy();
    expect(
      screen.getByText(
        "Recomputed from the current rule — the reason snapshot above records the original decision",
      ),
    ).toBeTruthy();
    expect(testState.requestedIds).toEqual(["suppression-1"]);
  });

  it("says when the current rule no longer matches the event", async () => {
    testState.rule = ruleFixture(["warning"]);

    renderChecks(detailFixture({ suppressionId: "suppression-1" }));

    expect(await screen.findByText("Missed")).toBeTruthy();
    expect(
      screen.getByText(
        "The current rule no longer matches this event — the delivery was suppressed under the rule in force at the time",
      ),
    ).toBeTruthy();
  });

  it("does not read the rule after it was deleted", async () => {
    const { container } = renderChecks(detailFixture({ suppressionId: null }));

    await waitFor(() => {
      expect(container.textContent).toBe("");
    });
    expect(testState.requestedIds).toEqual([]);
  });

  it("renders nothing when the rule read fails", async () => {
    testState.fail = true;

    const { container } = renderChecks(detailFixture({ suppressionId: "suppression-1" }));

    await waitFor(() => {
      expect(container.textContent).toBe("");
    });
    expect(testState.requestedIds).toEqual(["suppression-1"]);
  });
});

function detailFixture({ suppressionId }: { suppressionId: string | null }): DeliveryDetailData {
  return {
    job: {
      id: "delivery-1",
      eventId: "event-1",
      destinationId: "destination-1",
      routeId: "route-1",
      state: "suppressed",
      attemptCount: 0,
      maxAttempts: 5,
      nextAttemptAt: null,
      lastError: null,
      suppressionId,
      suppressedAt: "2026-10-12T10:00:00.000Z",
      suppressReason: "Maintenance window matched destination in [destination-1]",
      createdAt: "2026-10-12T09:59:59.000Z",
      updatedAt: "2026-10-12T10:00:00.000Z",
      finishedAt: null,
    },
    event: {
      id: "event-1",
      sourceId: "source-1",
      normalized: {
        title: "Disk almost full",
        message: "disk usage 92%",
        severity: "critical",
        status: "firing",
        fingerprint: "disk-full",
        labels: {},
        occurredAt: "2026-10-12T09:59:58.000Z",
      },
    },
  } as unknown as DeliveryDetailData;
}

function ruleFixture(severities: Suppression["matcher"]["severities"]): Suppression {
  return {
    id: "suppression-1",
    name: "October database migration",
    kind: "maintenance_window",
    enabled: true,
    reason: null,
    matcher: {
      sourceIds: [],
      severities,
      statuses: [],
      labels: [],
      titleContains: [],
      messageContains: [],
      destinationIds: [],
      fingerprints: [],
    },
    startsAt: "2026-10-12T09:00:00.000Z",
    endsAt: "2026-10-12T11:00:00.000Z",
    createdBy: null,
    createdAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-12T08:00:00.000Z",
  };
}
