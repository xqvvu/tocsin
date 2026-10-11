import { describe, expect, it } from "vite-plus/test";

import type { RouteDefinition } from "@tocsin/core";

import { sourceRouteCoverage } from "#/features/sources/model/source-route-coverage";

type RouteSummary = RouteDefinition;

describe("source route coverage", () => {
  it("counts enabled direct and catch-all routes covering a source", () => {
    expect(
      sourceRouteCoverage("source-1", [
        routeFixture("direct", "Direct", ["source-1"], true),
        routeFixture("catch-all", "Catch all", [], true),
        routeFixture("other", "Other", ["source-2"], true),
        routeFixture("disabled", "Disabled", ["source-1"], false),
      ]),
    ).toEqual({
      enabledRouteCount: 2,
      directRouteCount: 1,
      catchAllRouteCount: 1,
      routeNames: ["Direct", "Catch all"],
    });
  });
});

function routeFixture(
  id: string,
  name: string,
  sourceIds: string[],
  enabled: boolean,
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
    destinationIds: ["destination-1"],
  };
}
