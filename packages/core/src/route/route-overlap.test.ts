import { describe, expect, it } from "vite-plus/test";

import type { RouteDefinitionInput, RouteRuleInput } from "#core/route/route";
import { findPotentialRouteOverlaps } from "#core/route/route-overlap";

function route(
  id: string,
  overrides: Partial<Omit<RouteDefinitionInput, "id">> = {},
): RouteDefinitionInput {
  return {
    id,
    name: id.toUpperCase(),
    enabled: true,
    destinationIds: ["dest-sre"],
    rule: {},
    ...overrides,
  };
}

describe("findPotentialRouteOverlaps", () => {
  it("reports two catch-all routes that share a destination", () => {
    expect(findPotentialRouteOverlaps([route("a"), route("b")])).toEqual([
      {
        routeIds: ["a", "b"],
        routeNames: ["A", "B"],
        sharedDestinationIds: ["dest-sre"],
      },
    ]);
  });

  it("keeps only the destinations both routes send to", () => {
    const overlaps = findPotentialRouteOverlaps([
      route("a", { destinationIds: ["dest-sre", "dest-chat"] }),
      route("b", { destinationIds: ["dest-chat", "dest-mail"] }),
    ]);

    expect(overlaps[0]?.sharedDestinationIds).toEqual(["dest-chat"]);
  });

  it("proves routes apart when they share no destination", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", { destinationIds: ["dest-sre"] }),
        route("b", { destinationIds: ["dest-chat"] }),
      ]),
    ).toEqual([]);
  });

  it("treats an empty condition as a wildcard", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", { rule: {} }),
        route("b", { rule: { sourceIds: ["source-grafana"], severities: ["critical"] } }),
      ]),
    ).toHaveLength(1);
  });

  const disjointConditions: Array<[string, RouteRuleInput, RouteRuleInput]> = [
    ["source", { sourceIds: ["source-grafana"] }, { sourceIds: ["source-signoz"] }],
    ["severity", { severities: ["critical"] }, { severities: ["warning"] }],
    ["status", { statuses: ["firing"] }, { statuses: ["resolved"] }],
  ];

  it.each(disjointConditions)(
    "proves routes apart on a disjoint %s condition",
    (_dimension, left, right) => {
      expect(
        findPotentialRouteOverlaps([route("a", { rule: left }), route("b", { rule: right })]),
      ).toEqual([]);
    },
  );

  it("proves routes apart on a shared condition value", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", { rule: { severities: ["critical", "warning"] } }),
        route("b", { rule: { severities: ["warning"] } }),
      ]),
    ).toHaveLength(1);
  });

  it("proves routes apart when label equality disagrees on one key", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", { rule: { labels: [{ key: "team", operator: "equals", value: "sre" }] } }),
        route("b", { rule: { labels: [{ key: "team", operator: "equals", value: "api" }] } }),
      ]),
    ).toEqual([]);
  });

  it("keeps an equality label compatible with a substring it contains", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", {
          rule: { labels: [{ key: "service", operator: "equals", value: "api-prod" }] },
        }),
        route("b", { rule: { labels: [{ key: "service", operator: "contains", value: "api" }] } }),
      ]),
    ).toHaveLength(1);
  });

  it("proves an equality label apart from a substring it cannot contain", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", {
          rule: { labels: [{ key: "service", operator: "equals", value: "api-prod" }] },
        }),
        route("b", { rule: { labels: [{ key: "service", operator: "contains", value: "db" }] } }),
      ]),
    ).toEqual([]);
  });

  it("keeps two substring conditions on the same key compatible", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", { rule: { labels: [{ key: "service", operator: "contains", value: "api" }] } }),
        route("b", { rule: { labels: [{ key: "service", operator: "contains", value: "prod" }] } }),
      ]),
    ).toHaveLength(1);
  });

  it("keeps different label keys compatible", () => {
    expect(
      findPotentialRouteOverlaps([
        route("a", { rule: { labels: [{ key: "team", operator: "equals", value: "sre" }] } }),
        route("b", { rule: { labels: [{ key: "service", operator: "equals", value: "api" }] } }),
      ]),
    ).toHaveLength(1);
  });

  it("does not let a title or message substring prove routes apart", () => {
    // Both needles can live in one title, so the pair stays a possible overlap.
    expect(
      findPotentialRouteOverlaps([
        route("a", { rule: { titleContains: ["Timeout"] } }),
        route("b", { rule: { titleContains: ["Latency"] } }),
      ]),
    ).toHaveLength(1);
  });

  it("ignores disabled routes", () => {
    expect(findPotentialRouteOverlaps([route("a"), route("b", { enabled: false })])).toEqual([]);
  });

  it("reports every pair once, in input order", () => {
    const overlaps = findPotentialRouteOverlaps([route("a"), route("b"), route("c")]);

    expect(overlaps.map((overlap) => overlap.routeIds)).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });
});
