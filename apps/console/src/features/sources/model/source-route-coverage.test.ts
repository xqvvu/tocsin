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
      directRouteCount: 1,
      catchAllRouteCount: 1,
      routeNames: ["Direct", "Catch all"],
      blockedRouteNames: [],
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
      directRouteCount: 0,
      catchAllRouteCount: 0,
      routeNames: [],
      blockedRouteNames: [],
    });
  });
});

function routeFixture(
  id: string,
  name: string,
  sourceIds: string[],
  enabled: boolean,
  destinationIds: string[] = ["destination-1"],
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
