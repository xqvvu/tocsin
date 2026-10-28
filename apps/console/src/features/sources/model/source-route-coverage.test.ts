import { describe, expect, it } from "vite-plus/test";

import type { DestinationSummary, RouteDefinition } from "@tocsin/core";

import { sourceRouteCoverage } from "#/features/sources/model/source-route-coverage";

type RouteSummary = RouteDefinition;

describe("source route coverage", () => {
  it("counts enabled direct and catch-all routes covering a source", () => {
    expect(
      sourceRouteCoverage(
        "source-1",
        [
          routeFixture("direct", "Direct", ["source-1"], true),
          routeFixture("catch-all", "Catch all", [], true),
          routeFixture("other", "Other", ["source-2"], true),
          routeFixture("disabled", "Disabled", ["source-1"], false),
        ],
        [destinationFixture("destination-1", true)],
      ),
    ).toEqual({
      enabledRouteCount: 2,
      deliverableRouteCount: 2,
      blockedRouteCount: 0,
      conditionalRouteCount: 0,
      directRouteCount: 1,
      catchAllRouteCount: 1,
      routeNames: ["Direct", "Catch all"],
      blockedRouteNames: [],
      conditionalRouteNames: [],
    });
  });

  it("counts a route as deliverable when at least one linked destination is enabled", () => {
    const coverage = sourceRouteCoverage(
      "source-1",
      [routeFixture("mixed", "Mixed", ["source-1"], true, ["off", "on"])],
      [destinationFixture("off", false), destinationFixture("on", true)],
    );

    expect(coverage.deliverableRouteCount).toBe(1);
    expect(coverage.blockedRouteCount).toBe(0);
    expect(coverage.blockedRouteNames).toEqual([]);
  });

  it("reports routes whose destinations are all disabled or missing", () => {
    const coverage = sourceRouteCoverage(
      "source-1",
      [
        routeFixture("disabled-target", "Disabled target", ["source-1"], true, ["off"]),
        routeFixture("missing-target", "Missing target", ["source-1"], true, ["gone"]),
        routeFixture("healthy", "Healthy", ["source-1"], true, ["on"]),
      ],
      [destinationFixture("off", false), destinationFixture("on", true)],
    );

    expect(coverage.enabledRouteCount).toBe(3);
    expect(coverage.deliverableRouteCount).toBe(1);
    expect(coverage.blockedRouteCount).toBe(2);
    expect(coverage.routeNames).toEqual(["Disabled target", "Missing target", "Healthy"]);
    expect(coverage.blockedRouteNames).toEqual(["Disabled target", "Missing target"]);
  });

  it("ignores disabled routes even when their destinations are enabled", () => {
    const coverage = sourceRouteCoverage(
      "source-1",
      [routeFixture("disabled", "Disabled", ["source-1"], false, ["on"])],
      [destinationFixture("on", true)],
    );

    expect(coverage).toEqual({
      enabledRouteCount: 0,
      deliverableRouteCount: 0,
      blockedRouteCount: 0,
      conditionalRouteCount: 0,
      directRouteCount: 0,
      catchAllRouteCount: 0,
      routeNames: [],
      blockedRouteNames: [],
      conditionalRouteNames: [],
    });
  });

  it("marks deliverable routes that only fire on an event condition", () => {
    const coverage = sourceRouteCoverage(
      "source-1",
      [
        routeFixture("all", "All alerts", ["source-1"], true),
        routeFixture("critical", "Critical only", ["source-1"], true, ["destination-1"], {
          severities: ["critical"],
        }),
      ],
      [destinationFixture("destination-1", true)],
    );

    // The condition narrows what the route forwards, not whether it covers the
    // source, so both stay deliverable and only one reads as conditional.
    expect(coverage.deliverableRouteCount).toBe(2);
    expect(coverage.conditionalRouteCount).toBe(1);
    expect(coverage.conditionalRouteNames).toEqual(["Critical only"]);
  });

  it("does not count a conditional route that cannot deliver", () => {
    const coverage = sourceRouteCoverage(
      "source-1",
      [
        routeFixture("critical", "Critical only", ["source-1"], true, ["off"], {
          severities: ["critical"],
        }),
      ],
      [destinationFixture("off", false)],
    );

    expect(coverage.deliverableRouteCount).toBe(0);
    expect(coverage.conditionalRouteCount).toBe(0);
    expect(coverage.conditionalRouteNames).toEqual([]);
    expect(coverage.blockedRouteNames).toEqual(["Critical only"]);
  });

  it("keeps a catch-all route without event conditions unconditional", () => {
    const coverage = sourceRouteCoverage(
      "source-1",
      [routeFixture("catch-all", "Catch all", [], true)],
      [destinationFixture("destination-1", true)],
    );

    expect(coverage.conditionalRouteCount).toBe(0);
  });
});

function routeFixture(
  id: string,
  name: string,
  sourceIds: string[],
  enabled: boolean,
  destinationIds: string[] = ["destination-1"],
  rule: Partial<RouteSummary["rule"]> = {},
): RouteSummary {
  return {
    id,
    name,
    enabled,
    rule: {
      sourceIds,
      severities: [],
      statuses: [],
      labels: [],
      titleContains: [],
      messageContains: [],
      ...rule,
    },
    destinationIds,
  };
}

function destinationFixture(id: string, enabled: boolean): DestinationSummary {
  return {
    id,
    name: id,
    kind: "generic_webhook",
    enabled,
  };
}
