import { describe, expect, it } from "vite-plus/test";

import type { RouteDefinition } from "@tocsin/core";

import { routeReferenceImpact } from "#/features/routes/model/route-reference-impact";

type RouteSummary = RouteDefinition;

describe("route reference impact", () => {
  it("counts routes a source delete would remove or narrow", () => {
    const impact = routeReferenceImpact(
      [
        routeFixture("route-1", "Only source", ["source-1"], ["destination-1"]),
        routeFixture("route-2", "Shared source", ["source-1", "source-2"], ["destination-1"]),
        routeFixture("route-3", "Catch all", [], ["destination-1"]),
        routeFixture("route-4", "Other source", ["source-3"], ["destination-1"]),
      ],
      (route) => route.rule.sourceIds,
      "source-1",
    );

    expect(impact).toEqual({
      narrowedRouteCount: 1,
      deletedRouteCount: 1,
    });
  });

  it("counts routes a destination delete would remove or narrow", () => {
    const impact = routeReferenceImpact(
      [
        routeFixture("route-1", "Only target", ["source-1"], ["destination-1"]),
        routeFixture("route-2", "Shared target", ["source-1"], ["destination-1", "destination-2"]),
        routeFixture("route-3", "Other target", ["source-1"], ["destination-3"]),
      ],
      (route) => route.destinationIds,
      "destination-1",
    );

    expect(impact).toEqual({
      narrowedRouteCount: 1,
      deletedRouteCount: 1,
    });
  });

  it("reports no impact when nothing references the entity", () => {
    const impact = routeReferenceImpact(
      [routeFixture("route-1", "Unrelated", ["source-2"], ["destination-1"])],
      (route) => route.rule.sourceIds,
      "source-1",
    );

    expect(impact).toEqual({
      narrowedRouteCount: 0,
      deletedRouteCount: 0,
    });
  });

  it("treats duplicate ids as the same reference, matching the repository cleanup", () => {
    const impact = routeReferenceImpact(
      [routeFixture("route-1", "Duplicated", ["source-1", "source-1"], ["destination-1"])],
      (route) => route.rule.sourceIds,
      "source-1",
    );

    expect(impact).toEqual({
      narrowedRouteCount: 0,
      deletedRouteCount: 1,
    });
  });
});

function routeFixture(
  id: string,
  name: string,
  sourceIds: string[],
  destinationIds: string[],
): RouteSummary {
  return {
    id,
    name,
    enabled: true,
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
