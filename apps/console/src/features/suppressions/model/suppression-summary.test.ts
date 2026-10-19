import { describe, expect, it } from "vite-plus/test";

import type { Suppression, SuppressionMatcher } from "@tocsin/core";

import { isCatchAllMatcher, summarizeActiveSuppressions } from "./suppression-summary";

const NOW = "2026-10-19T10:00:00.000Z";

function matcher(overrides: Partial<SuppressionMatcher> = {}): SuppressionMatcher {
  return {
    sourceIds: [],
    destinationIds: [],
    severities: [],
    statuses: [],
    fingerprints: [],
    labels: [],
    titleContains: [],
    messageContains: [],
    ...overrides,
  };
}

function suppression(overrides: Partial<Suppression> = {}): Suppression {
  return {
    id: "suppression-1",
    name: "Database migration",
    kind: "maintenance_window",
    enabled: true,
    reason: null,
    matcher: matcher(),
    startsAt: "2026-10-19T09:00:00.000Z",
    endsAt: "2026-10-19T11:00:00.000Z",
    createdBy: null,
    createdAt: "2026-10-19T08:00:00.000Z",
    updatedAt: "2026-10-19T08:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeActiveSuppressions", () => {
  it("reports nothing when there are no rules", () => {
    expect(summarizeActiveSuppressions([], NOW)).toEqual({
      activeCount: 0,
      catchAllCount: 0,
      names: [],
    });
  });

  it("counts only rules in force at the given instant", () => {
    const summary = summarizeActiveSuppressions(
      [
        suppression({ id: "active", name: "In force" }),
        suppression({
          id: "scheduled",
          name: "Not started",
          startsAt: "2026-10-19T10:30:00.000Z",
          endsAt: "2026-10-19T12:00:00.000Z",
        }),
        suppression({
          id: "expired",
          name: "Already over",
          startsAt: "2026-10-19T07:00:00.000Z",
          endsAt: "2026-10-19T09:00:00.000Z",
        }),
        suppression({ id: "disabled", name: "Switched off", enabled: false }),
      ],
      NOW,
    );

    expect(summary.activeCount).toBe(1);
    expect(summary.names).toEqual(["In force"]);
  });

  it("separates catch-all rules from scoped rules", () => {
    const summary = summarizeActiveSuppressions(
      [
        suppression({ id: "all", name: "Everything" }),
        suppression({
          id: "critical-only",
          name: "Critical only",
          matcher: matcher({ severities: ["critical"] }),
        }),
      ],
      NOW,
    );

    expect(summary.activeCount).toBe(2);
    expect(summary.catchAllCount).toBe(1);
    expect(summary.names).toEqual(["Everything", "Critical only"]);
  });
});

describe("isCatchAllMatcher", () => {
  it("treats an empty matcher as everything", () => {
    expect(isCatchAllMatcher(matcher())).toBe(true);
  });

  it("is false as soon as any dimension is constrained", () => {
    expect(isCatchAllMatcher(matcher({ sourceIds: ["source-1"] }))).toBe(false);
    expect(isCatchAllMatcher(matcher({ fingerprints: ["abc"] }))).toBe(false);
    expect(
      isCatchAllMatcher(matcher({ labels: [{ key: "env", operator: "equals", value: "prod" }] })),
    ).toBe(false);
  });
});
