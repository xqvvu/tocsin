// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RouteDefinition, RouteMatchResult } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryRouteEvidence } from "#/features/deliveries/ui/delivery-route-evidence";
import { AppIntlProvider } from "#/i18n/provider";

describe("delivery route evidence", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the intake snapshot and the current rule side by side", () => {
    renderEvidence(
      detailFixture({
        route: routeFixture(["critical"]),
        routeMatches: [
          matchFixture({
            checks: [
              {
                field: "severity",
                matched: true,
                detail: "Expected one of critical, received critical",
                condition: "compare",
                expected: ["critical"],
                actual: "critical",
              },
            ],
          }),
        ],
      }),
    );

    expect(screen.getByText("Route match evidence")).toBeTruthy();
    expect(screen.getByText("Intake snapshot")).toBeTruthy();
    expect(screen.getByText("Current rule")).toBeTruthy();
    // The snapshot and the live route carry the same name today.
    expect(screen.getAllByText("Checkout critical")).toHaveLength(2);
    expect(screen.getAllByText("expected Critical, event carried Critical")).toHaveLength(2);
    expect(
      screen.queryByText(
        "The current rule no longer matches this event — this delivery ran under the rule in force at the time",
      ),
    ).toBeNull();
  });

  it("states that the current rule no longer matches without hiding the delivery", () => {
    renderEvidence(
      detailFixture({
        route: routeFixture(["warning"]),
        routeMatches: [matchFixture()],
      }),
    );

    expect(screen.getByText("Matched")).toBeTruthy();
    expect(screen.getByText("Missed")).toBeTruthy();
    expect(
      screen.getByText(
        "The current rule no longer matches this event — this delivery ran under the rule in force at the time",
      ),
    ).toBeTruthy();
  });

  it("names a disabled route as disabled instead of a missing condition", () => {
    renderEvidence(
      detailFixture({
        route: { ...routeFixture(["critical"]), enabled: false },
        routeMatches: [matchFixture()],
      }),
    );

    // The enabled check is route state, not a rule condition.
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.queryByText("No condition")).toBeNull();
  });

  it("says when the event predates intake snapshots", () => {
    renderEvidence(
      detailFixture({
        route: routeFixture(["critical"]),
        routeMatches: null,
      }),
    );

    expect(
      screen.getByText(
        "No route snapshot was recorded when this event arrived (it predates snapshots)",
      ),
    ).toBeTruthy();
  });

  it("explains a route that the intake snapshot never evaluated", () => {
    renderEvidence(
      detailFixture({
        route: routeFixture(["critical"]),
        routeMatches: [matchFixture({ routeId: "route-other", routeName: "Other route" })],
      }),
    );

    expect(
      screen.getByText(
        "The intake snapshot has no entry for this route — a replay evaluated the rule at replay time",
      ),
    ).toBeTruthy();
  });

  it("explains a route that matched on replay but not at intake", () => {
    renderEvidence(
      detailFixture({
        route: routeFixture(["critical"]),
        routeMatches: [matchFixture({ matched: false })],
      }),
    );

    expect(
      screen.getByText("This route did not match at intake — the delivery came from a replay"),
    ).toBeTruthy();
  });

  it("reports a route that no longer exists", () => {
    renderEvidence(
      detailFixture({
        route: null,
        routeMatches: [matchFixture()],
      }),
    );

    expect(screen.getByText("The route no longer exists")).toBeTruthy();
  });

  it("defers to the intake snapshot when the event content was redacted", () => {
    const route = routeFixture(["critical"]);
    const detail = detailFixture({
      route: {
        ...route,
        rule: { ...route.rule, titleContains: ["Bearer abcdefgh1234"] },
      },
      routeMatches: [matchFixture()],
    });
    detail.event.normalized.title = "Disk failed Authorization: [REDACTED]";

    renderEvidence(detail);

    // Re-evaluating the rule against `[REDACTED]` would report a mismatch that
    // never happened, so the page must say the evidence is unavailable instead.
    expect(
      screen.getByText(
        "The event content was redacted, so the current rule cannot be re-evaluated here — the intake snapshot below is the authoritative evidence",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "The current rule no longer matches this event — this delivery ran under the rule in force at the time",
      ),
    ).toBeNull();
  });

  it("renders nothing for a manual delivery, which bypasses routing", () => {
    renderEvidence(
      detailFixture({
        routeId: null,
        route: null,
        routeMatches: null,
      }),
    );

    expect(screen.queryByText("Route match evidence")).toBeNull();
  });
});

function renderEvidence(detail: DeliveryDetailData): void {
  render(
    <AppIntlProvider locale="en-US">
      <DeliveryRouteEvidence detail={detail} />
    </AppIntlProvider>,
  );
}

function detailFixture(overrides: {
  routeId?: string | null;
  route: DeliveryDetailData["route"];
  routeMatches: RouteMatchResult[] | null;
}): DeliveryDetailData {
  return {
    job: {
      id: "delivery-1",
      eventId: "event-1",
      destinationId: "destination-1",
      routeId: overrides.routeId === undefined ? "route-1" : overrides.routeId,
      state: "succeeded",
      attemptCount: 1,
      maxAttempts: 5,
      nextAttemptAt: null,
      lastError: null,
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      createdAt: "2026-10-19T10:00:00.000Z",
      updatedAt: "2026-10-19T10:00:00.000Z",
      finishedAt: "2026-10-19T10:00:01.000Z",
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
        fields: {},
        links: [],
      },
      rawPayload: {},
      rawHeaders: {},
      routeMatches: overrides.routeMatches,
      receivedAt: "2026-10-19T10:00:00.000Z",
      providerMetadata: {},
    },
    source: { id: "source-1", name: "Prometheus", provider: "prometheus", enabled: true },
    destination: { id: "destination-1", name: "Ops group", kind: "feishu", enabled: true },
    destinationMetadata: {},
    route: overrides.route,
    renderedPayload: null,
    providerReference: null,
    attempts: [],
    pings: [],
  } as unknown as DeliveryDetailData;
}

function routeFixture(severities: RouteDefinition["rule"]["severities"]): RouteDefinition {
  return {
    id: "route-1",
    name: "Checkout critical",
    enabled: true,
    rule: {
      sourceIds: [],
      severities,
      statuses: [],
      labels: [],
      titleContains: [],
      messageContains: [],
    },
    destinationIds: ["destination-1"],
  };
}

function matchFixture(overrides: Partial<RouteMatchResult> = {}): RouteMatchResult {
  return {
    routeId: "route-1",
    routeName: "Checkout critical",
    matched: true,
    destinationIds: ["destination-1"],
    checks: [],
    ...overrides,
  };
}
