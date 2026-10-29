import { describe, expect, it } from "vite-plus/test";

import type { RouteDefinition, SourceSummary } from "@tocsin/core";

import { destinationSourceImpact } from "#/features/destinations/model/destination-source-impact";

type RouteSummary = RouteDefinition;

describe("destination source impact", () => {
  it("lists enabled sources reached through enabled routes to the destination", () => {
    expect(
      destinationSourceImpact(
        "destination-1",
        [
          routeFixture("route-a", ["source-1", "source-2"], true),
          routeFixture("route-b", ["source-1"], true),
          routeFixture("other-target", ["source-3"], true, ["destination-2"]),
          routeFixture("disabled-route", ["source-4"], false),
          routeFixture("disabled-source", ["source-5"], true),
        ],
        [
          sourceFixture("source-1", "Grafana production"),
          sourceFixture("source-2", "SigNoz staging"),
          sourceFixture("source-3", "Uptime Kuma"),
          sourceFixture("source-4", "Paused collector"),
          sourceFixture("source-5", "Retired check", false),
        ],
      ),
    ).toEqual({
      affectedSourceCount: 2,
      affectedSourceNames: ["Grafana production", "SigNoz staging"],
      coversAllSources: false,
    });
  });

  it("treats a catch-all route as covering every enabled source", () => {
    // An empty sourceIds list matches sources created later too, so the count
    // is a snapshot while the sentence has to say "all sources".
    expect(
      destinationSourceImpact(
        "destination-1",
        [routeFixture("catch-all", [], true)],
        [
          sourceFixture("source-1", "Grafana production"),
          sourceFixture("source-2", "SigNoz staging"),
          sourceFixture("source-3", "Retired check", false),
        ],
      ),
    ).toEqual({
      affectedSourceCount: 2,
      affectedSourceNames: ["Grafana production", "SigNoz staging"],
      coversAllSources: true,
    });
  });

  it("ignores catch-all routes that are disabled", () => {
    expect(
      destinationSourceImpact(
        "destination-1",
        [routeFixture("catch-all", [], false)],
        [sourceFixture("source-1", "Grafana production")],
      ),
    ).toEqual({
      affectedSourceCount: 0,
      affectedSourceNames: [],
      coversAllSources: false,
    });
  });

  it("drops source ids that no longer resolve to a source", () => {
    expect(
      destinationSourceImpact(
        "destination-1",
        [routeFixture("route-a", ["source-1", "deleted-source"], true)],
        [sourceFixture("source-1", "Grafana production")],
      ).affectedSourceNames,
    ).toEqual(["Grafana production"]);
  });

  it("reports nothing when no enabled route targets the destination", () => {
    expect(
      destinationSourceImpact(
        "destination-1",
        [routeFixture("other-target", ["source-1"], true, ["destination-2"])],
        [sourceFixture("source-1", "Grafana production")],
      ),
    ).toEqual({
      affectedSourceCount: 0,
      affectedSourceNames: [],
      coversAllSources: false,
    });
  });
});

function routeFixture(
  id: string,
  sourceIds: string[],
  enabled: boolean,
  destinationIds: string[] = ["destination-1"],
): RouteSummary {
  return {
    id,
    name: id,
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

function sourceFixture(id: string, name: string, enabled = true): SourceSummary {
  return {
    id,
    name,
    provider: "generic",
    enabled,
  };
}
