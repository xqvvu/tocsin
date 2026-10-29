import { describe, expect, it } from "vite-plus/test";

import type { RouteDefinition, SourceSummary } from "@tocsin/core";

import { destinationRouteCoverage } from "#/features/destinations/model/destination-route-coverage";

type RouteSummary = RouteDefinition;

describe("destination route coverage", () => {
  it("counts enabled routes separately from disabled references", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [
          routeFixture("route-1", "Primary paging", ["destination-1"], true),
          routeFixture("route-2", "Paused paging", ["destination-1"], false),
          routeFixture("route-3", "Other target", ["destination-2"], true),
        ],
        [sourceFixture("source-1", true)],
      ),
    ).toEqual({
      enabledRouteCount: 1,
      reachableRouteCount: 1,
      blockedRouteCount: 0,
      disabledRouteCount: 1,
      conditionalRouteCount: 0,
      routeNames: ["Primary paging"],
      blockedRouteNames: [],
      conditionalRouteNames: [],
    });
  });

  it("flags reachable routes that only deliver matching events", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [
          routeFixture("route-1", "All checkout", ["destination-1"], true),
          routeFixture("route-2", "Critical only", ["destination-1"], true, {
            severities: ["critical"],
          }),
          routeFixture("route-3", "Paused critical", ["destination-1"], false, {
            severities: ["critical"],
          }),
        ],
        [sourceFixture("source-1", true)],
      ),
    ).toEqual({
      enabledRouteCount: 2,
      reachableRouteCount: 2,
      blockedRouteCount: 0,
      disabledRouteCount: 1,
      conditionalRouteCount: 1,
      routeNames: ["All checkout", "Critical only"],
      blockedRouteNames: [],
      conditionalRouteNames: ["Critical only"],
    });
  });

  it("blocks an enabled route whose only source is disabled", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [
          routeFixture("route-1", "Grafana paging", ["destination-1"], true, {
            sourceIds: ["source-1"],
          }),
        ],
        [sourceFixture("source-1", false)],
      ),
    ).toMatchObject({
      enabledRouteCount: 1,
      reachableRouteCount: 0,
      blockedRouteCount: 1,
      blockedRouteNames: ["Grafana paging"],
    });
  });

  it("keeps a route reachable when one of its sources is enabled", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [
          routeFixture("route-1", "Shared paging", ["destination-1"], true, {
            sourceIds: ["source-1", "source-2"],
          }),
        ],
        [sourceFixture("source-1", false), sourceFixture("source-2", true)],
      ),
    ).toMatchObject({
      reachableRouteCount: 1,
      blockedRouteCount: 0,
    });
  });

  it("treats a source id that no longer exists as unavailable", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [
          routeFixture("route-1", "Deleted source", ["destination-1"], true, {
            sourceIds: ["source-deleted"],
          }),
        ],
        [sourceFixture("source-1", true)],
      ),
    ).toMatchObject({
      reachableRouteCount: 0,
      blockedRouteCount: 1,
    });
  });

  it("blocks a catch-all route while every source is disabled", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [routeFixture("route-1", "Catch all", ["destination-1"], true)],
        [sourceFixture("source-1", false), sourceFixture("source-2", false)],
      ),
    ).toMatchObject({
      reachableRouteCount: 0,
      blockedRouteCount: 1,
    });
  });

  it("blocks a catch-all route when no source exists", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [routeFixture("route-1", "Catch all", ["destination-1"], true)],
        [],
      ),
    ).toMatchObject({
      reachableRouteCount: 0,
      blockedRouteCount: 1,
    });
  });

  it("counts conditions only among reachable routes", () => {
    expect(
      destinationRouteCoverage(
        "destination-1",
        [
          routeFixture("route-1", "Reachable critical", ["destination-1"], true, {
            sourceIds: ["source-1"],
            severities: ["critical"],
          }),
          routeFixture("route-2", "Blocked critical", ["destination-1"], true, {
            sourceIds: ["source-2"],
            severities: ["critical"],
          }),
        ],
        [sourceFixture("source-1", true), sourceFixture("source-2", false)],
      ),
    ).toEqual({
      enabledRouteCount: 2,
      reachableRouteCount: 1,
      blockedRouteCount: 1,
      disabledRouteCount: 0,
      conditionalRouteCount: 1,
      routeNames: ["Reachable critical", "Blocked critical"],
      blockedRouteNames: ["Blocked critical"],
      conditionalRouteNames: ["Reachable critical"],
    });
  });
});

function routeFixture(
  id: string,
  name: string,
  destinationIds: string[],
  enabled: boolean,
  conditions: Partial<RouteSummary["rule"]> = {},
): RouteSummary {
  return {
    id,
    name,
    enabled,
    rule: {
      sourceIds: [],
      severities: [],
      statuses: [],
      labels: [],
      titleContains: [],
      messageContains: [],
      ...conditions,
    },
    destinationIds,
  };
}

function sourceFixture(id: string, enabled: boolean): SourceSummary {
  return {
    id,
    name: id,
    provider: "grafana",
    enabled,
  };
}
