// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { EventDetailRouteMatchesTable } from "#/features/events/ui/event-detail-route-matches-table";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { AppIntlProvider } from "#/i18n/provider";

type RouteMatches = EventDetailData["routeMatches"];
type Provenance = EventDetailData["routeMatchesProvenance"];

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

    expect(screen.getByText("expected Critical, event carried critical")).toBeTruthy();
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

    expect(
      screen.getByText("label service expected checkout, event has no such label"),
    ).toBeTruthy();
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

function renderTable(matches: RouteMatches, provenance: Provenance = "intake_snapshot") {
  return render(
    <AppIntlProvider locale="en-US">
      <EventDetailRouteMatchesTable
        matches={matches}
        matchedRouteCount={matches.filter((entry) => entry.matched).length}
        provenance={provenance}
      />
    </AppIntlProvider>,
  );
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
