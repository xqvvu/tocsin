// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EventDetailRouteMatchesTable } from "#/features/events/ui/event-detail-route-matches-table";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { AppIntlProvider } from "#/i18n/provider";

// The table renders inside the event detail route, whose real Link needs the
// app router. Rendering the anchor directly keeps the test on the table's own
// behavior: which outcome badge opens which filtered delivery list.
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

type RouteMatches = EventDetailData["routeMatches"];
type Provenance = EventDetailData["routeMatchesProvenance"];
type Deliveries = EventDetailData["deliveries"];
type Delivery = Deliveries[number];

describe("event detail route matches table", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the event's actual value next to the expected one", () => {
    renderTable([
      match({
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
    ]);

    expect(screen.getByText("expected Critical, event carried Critical")).toBeTruthy();
  });

  it("names the missing label instead of only stating the expectation", () => {
    renderTable([
      match({
        matched: false,
        checks: [
          {
            field: "label",
            matched: false,
            detail: "Expected label service equals checkout",
            condition: "compare",
            expected: ["checkout"],
            labelKey: "service",
          },
        ],
      }),
    ]);

    expect(screen.getByText("service expected checkout, event has no such label")).toBeTruthy();
  });

  it("quotes the haystack for a title/message condition that missed", () => {
    renderTable([
      match({
        matched: false,
        checks: [
          {
            field: "message",
            matched: false,
            detail: "Expected message to contain latency",
            condition: "compare",
            expected: ["latency"],
            actual: "checkout returned 503",
          },
        ],
      }),
    ]);

    expect(
      screen.getByText("expected to contain latency, event carried checkout returned 503"),
    ).toBeTruthy();
  });

  it("stays readable when the rule carries no condition for a field", () => {
    renderTable([
      match({
        checks: [
          { field: "source", matched: true, detail: "No source condition", condition: "none" },
        ],
      }),
    ]);

    expect(screen.getByText("No condition")).toBeTruthy();
  });

  it("falls back to the recorded detail for snapshots written before structured checks", () => {
    const legacyDetail = "Expected one of critical, received warning";

    renderTable([match({ checks: [{ field: "severity", matched: false, detail: legacyDetail }] })]);

    expect(screen.getByText(legacyDetail)).toBeTruthy();
  });

  it("shows what each matched route actually delivered", () => {
    renderTable(
      [
        match({ routeId: "route-1", routeName: "Critical checkout" }),
        match({ routeId: "route-2", routeName: "Warning digest" }),
      ],
      "intake_snapshot",
      [
        delivery({ id: "delivery-1", routeId: "route-1", state: "succeeded" }),
        delivery({ id: "delivery-2", routeId: "route-1", state: "succeeded" }),
        delivery({ id: "delivery-3", routeId: "route-1", state: "failed" }),
        delivery({ id: "delivery-4", routeId: "route-2", state: "pending" }),
      ],
    );

    expect(screen.getByText("Succeeded 2")).toBeTruthy();
    expect(screen.getByText("Failed 1")).toBeTruthy();
    expect(screen.getByText("Pending 1")).toBeTruthy();
  });

  it("opens this event's deliveries for one route and outcome", () => {
    renderTable(
      [
        match({ routeId: "route-1", routeName: "Critical checkout" }),
        match({ routeId: "route-2", routeName: "Warning digest" }),
      ],
      "intake_snapshot",
      [
        delivery({ id: "delivery-1", routeId: "route-1", state: "failed" }),
        delivery({ id: "delivery-2", routeId: "route-2", state: "pending" }),
      ],
      "evt-42",
    );

    // The badge is the drill-down from "this route had 1 failure" to the exact
    // row; all three dimensions have to survive the link, and the same state on
    // another route must not collapse into the same URL.
    expect(screen.getByText("Failed 1").closest("a")?.getAttribute("href")).toBe(
      "/deliveries?eventId=evt-42&routeId=route-1&deliveryState=failed",
    );
    expect(screen.getByText("Pending 1").closest("a")?.getAttribute("href")).toBe(
      "/deliveries?eventId=evt-42&routeId=route-2&deliveryState=pending",
    );
  });

  it("names the route and the drill-down in the accessible label", () => {
    renderTable(
      [match({ routeId: "route-1", routeName: "Critical checkout" })],
      "intake_snapshot",
      [delivery({ routeId: "route-1", state: "failed" })],
    );

    // Several rows repeat the same state badge, so the label alone has to say
    // which route the link narrows to.
    expect(screen.getByText("Failed 1").closest("a")?.getAttribute("aria-label")).toBe(
      "Failed: 1 · Critical checkout · Filter deliveries to this route",
    );
  });

  it("does not link an outcome that has no rows behind it", () => {
    const { container } = renderTable([match({ routeId: "route-1" })], "intake_snapshot", []);

    expect(screen.getByText("No deliveries")).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
  });

  it("explains a matched route that produced no delivery", () => {
    renderTable([match({ routeId: "route-1" })], "intake_snapshot", []);

    expect(screen.getByText("No deliveries")).toBeTruthy();
  });

  it("does not attribute a manual delivery to a route", () => {
    renderTable([match({ routeId: "route-1" })], "intake_snapshot", [
      delivery({ routeId: null, routeName: null }),
    ]);

    expect(screen.getByText("No deliveries")).toBeTruthy();
  });

  it("marks an unmatched route instead of claiming it delivered nothing", () => {
    renderTable([match({ matched: false })], "intake_snapshot", []);

    expect(screen.getByText("Not matched")).toBeTruthy();
  });

  it("distinguishes an intake snapshot from a recomputed result", () => {
    const { unmount } = renderTable([match({})], "intake_snapshot");

    expect(
      screen.getByText(
        "Recorded when the event arrived — reflects the routes that were in force then, and never rewritten",
      ),
    ).toBeTruthy();

    unmount();

    renderTable([match({})], "recomputed");

    expect(
      screen.getByText(
        "No snapshot exists for this event, so the current routes were evaluated on read — this is not what the rules said at the time",
      ),
    ).toBeTruthy();
  });
});

function renderTable(
  matches: RouteMatches,
  provenance: Provenance = "intake_snapshot",
  deliveries: Deliveries = [],
  eventId = "event-1",
) {
  return render(
    <AppIntlProvider locale="en-US">
      <EventDetailRouteMatchesTable
        eventId={eventId}
        matches={matches}
        matchedRouteCount={matches.filter((entry) => entry.matched).length}
        provenance={provenance}
        deliveries={deliveries}
      />
    </AppIntlProvider>,
  );
}

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: "delivery-1",
    eventId: "event-1",
    destinationId: "destination-1",
    routeId: "route-1",
    state: "succeeded",
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    suppressionId: null,
    suppressedAt: null,
    suppressReason: null,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:01.000Z",
    finishedAt: "2026-10-20T00:00:01.000Z",
    destinationName: "Feishu on-call",
    routeName: "Critical checkout",
    providerReference: null,
    lastResponseStatus: null,
    lastResponseAt: null,
    ...overrides,
  };
}

function match(overrides: Partial<RouteMatches[number]> = {}): RouteMatches[number] {
  return {
    routeId: "route-1",
    routeName: "Critical checkout",
    matched: true,
    destinationIds: ["destination-1"],
    checks: [],
    ...overrides,
  };
}
