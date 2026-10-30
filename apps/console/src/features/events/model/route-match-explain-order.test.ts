import { describe, expect, it } from "vite-plus/test";

import type { RouteMatchCheck, RouteMatchResult } from "@tocsin/core";

import { closestRouteMiss, missedCheckCount, orderRouteMatches } from "./route-match-explain-order";

describe("route match explain order", () => {
  it("keeps matched routes above every unmatched one", () => {
    const ordered = orderRouteMatches([
      route({ routeId: "miss-1", routeName: "A", matched: false, checks: [miss("severity")] }),
      route({ routeId: "hit-1", routeName: "B", matched: true }),
    ]);

    expect(ordered.map((match) => match.routeId)).toEqual(["hit-1", "miss-1"]);
  });

  it("keeps matched routes in their recorded order", () => {
    const ordered = orderRouteMatches([
      route({ routeId: "zebra", routeName: "Zebra", matched: true }),
      route({ routeId: "alpha", routeName: "Alpha", matched: true }),
    ]);

    expect(ordered.map((match) => match.routeId)).toEqual(["zebra", "alpha"]);
  });

  it("puts the route that failed the fewest checks first among misses", () => {
    const ordered = orderRouteMatches([
      route({
        routeId: "far",
        routeName: "Far",
        matched: false,
        checks: [miss("severity"), miss("status"), miss("source")],
      }),
      route({ routeId: "near", routeName: "Near", matched: false, checks: [miss("severity")] }),
    ]);

    expect(ordered.map((match) => match.routeId)).toEqual(["near", "far"]);
  });

  it("breaks equal miss counts by route name, then id", () => {
    const ordered = orderRouteMatches([
      route({ routeId: "b", routeName: "Beta", matched: false, checks: [miss("severity")] }),
      route({ routeId: "a", routeName: "Alpha", matched: false, checks: [miss("severity")] }),
      route({ routeId: "c", routeName: "Alpha", matched: false, checks: [miss("status")] }),
    ]);

    expect(ordered.map((match) => match.routeId)).toEqual(["a", "c", "b"]);
  });

  it("sorts snapshots without structured checks after misses with evidence", () => {
    const ordered = orderRouteMatches([
      route({ routeId: "legacy", routeName: "Legacy", matched: false, checks: [] }),
      route({ routeId: "known", routeName: "Known", matched: false, checks: [miss("severity")] }),
    ]);

    expect(ordered.map((match) => match.routeId)).toEqual(["known", "legacy"]);
  });

  it("counts passed checks as no miss", () => {
    expect(
      missedCheckCount([
        { field: "severity", matched: true, detail: "", condition: "compare" },
        { field: "status", matched: false, detail: "", condition: "compare" },
      ]),
    ).toBe(1);
  });

  it("names the closest miss only when there is something to compare against", () => {
    expect(
      closestRouteMiss([route({ routeId: "only", matched: false, checks: [miss("severity")] })]),
    ).toBeNull();

    expect(
      closestRouteMiss([
        route({ routeId: "near", matched: false, checks: [miss("severity")] }),
        route({
          routeId: "far",
          matched: false,
          checks: [miss("severity"), miss("status")],
        }),
      ]),
    ).toEqual({ routeId: "near", missedChecks: 1 });
  });

  it("does not claim a closest miss when the only evidence is a legacy snapshot", () => {
    expect(
      closestRouteMiss([
        route({ routeId: "legacy-a", matched: false, checks: [] }),
        route({ routeId: "legacy-b", matched: false, checks: [] }),
      ]),
    ).toBeNull();
  });

  it("never labels a matched route as a miss", () => {
    expect(
      closestRouteMiss([
        route({ routeId: "hit", matched: true }),
        route({ routeId: "near", matched: false, checks: [miss("severity")] }),
        route({
          routeId: "far",
          matched: false,
          checks: [miss("severity"), miss("status")],
        }),
      ]),
    ).toEqual({ routeId: "near", missedChecks: 1 });
  });
});

function route(overrides: Partial<RouteMatchResult> = {}): RouteMatchResult {
  return {
    routeId: "route-1",
    routeName: "Critical checkout",
    matched: true,
    destinationIds: ["destination-1"],
    checks: [],
    ...overrides,
  };
}

function miss(field: RouteMatchCheck["field"]): RouteMatchCheck {
  return {
    field,
    matched: false,
    detail: `Expected ${field} to match`,
    condition: "compare",
    expected: ["critical"],
    actual: "warning",
  };
}
