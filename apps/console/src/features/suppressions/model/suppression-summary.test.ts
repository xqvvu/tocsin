import { describe, expect, it } from "vite-plus/test";

import type { Suppression, SuppressionMatcher } from "@tocsin/core";

import { summarizeActiveSuppressions } from "./suppression-summary";

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
      expiringSoonCount: 0,
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

  it("flags only rules that are in force and end within 30 minutes", () => {
    const summary = summarizeActiveSuppressions(
      [
        suppression({ id: "soon", name: "Ends in 20 min", endsAt: "2026-10-19T10:20:00.000Z" }),
        suppression({ id: "edge", name: "Ends in 30 min", endsAt: "2026-10-19T10:30:00.000Z" }),
        suppression({ id: "later", name: "Ends in 31 min", endsAt: "2026-10-19T10:31:00.000Z" }),
        suppression({ id: "long", name: "Ends in an hour" }),
        suppression({
          id: "disabled",
          name: "Switched off",
          enabled: false,
          endsAt: "2026-10-19T10:05:00.000Z",
        }),
        suppression({
          id: "scheduled",
          name: "Starts later",
          startsAt: "2026-10-19T10:10:00.000Z",
          endsAt: "2026-10-19T10:20:00.000Z",
        }),
        suppression({
          id: "expired",
          name: "Already over",
          startsAt: "2026-10-19T08:00:00.000Z",
          endsAt: "2026-10-19T09:59:00.000Z",
        }),
        suppression({ id: "unreadable", name: "Bad timestamp", endsAt: "not-a-time" }),
      ],
      NOW,
    );

    expect(summary.activeCount).toBe(5);
    expect(summary.expiringSoonCount).toBe(2);
  });
});
