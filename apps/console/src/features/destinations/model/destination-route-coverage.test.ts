import { describe, expect, it } from "vite-plus/test";

import type { RouteDefinition } from "@tocsin/core";

import { destinationRouteCoverage } from "#/features/destinations/model/destination-route-coverage";

type RouteSummary = RouteDefinition;

describe("destination route coverage", () => {
  it("counts enabled routes separately from disabled references", () => {
    expect(
      destinationRouteCoverage("destination-1", [
        routeFixture("route-1", "Primary paging", ["destination-1"], true),
        routeFixture("route-2", "Paused paging", ["destination-1"], false),
        routeFixture("route-3", "Other target", ["destination-2"], true),
      ]),
    ).toEqual({
      enabledRouteCount: 1,
      disabledRouteCount: 1,
      routeNames: ["Primary paging"],
    });
  });
});

function routeFixture(
  id: string,
  name: string,
  destinationIds: string[],
  enabled: boolean,
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
    },
    destinationIds,
  };
}
