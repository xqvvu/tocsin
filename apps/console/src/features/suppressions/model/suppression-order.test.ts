import { describe, expect, it } from "vite-plus/test";

import type { Suppression, SuppressionMatcher } from "@tocsin/core";

import { sortSuppressionsForOperations } from "./suppression-order";

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

function active(overrides: Partial<Suppression> = {}): Suppression {
  return suppression(overrides);
}

function scheduled(overrides: Partial<Suppression> = {}): Suppression {
  return suppression({
    startsAt: "2026-10-19T12:00:00.000Z",
    endsAt: "2026-10-19T13:00:00.000Z",
    ...overrides,
  });
}

function disabled(overrides: Partial<Suppression> = {}): Suppression {
  return suppression({ enabled: false, ...overrides });
}

function expired(overrides: Partial<Suppression> = {}): Suppression {
  return suppression({
    startsAt: "2026-10-19T07:00:00.000Z",
    endsAt: "2026-10-19T08:00:00.000Z",
    ...overrides,
  });
}

function ids(suppressions: Suppression[]): string[] {
  return suppressions.map((suppression) => suppression.id);
}

describe("sortSuppressionsForOperations", () => {
  it("puts in-force rules above scheduled, disabled and expired rules", () => {
    const sorted = sortSuppressionsForOperations(
      [
        expired({ id: "expired", name: "Yesterday" }),
        disabled({ id: "disabled", name: "Switched off" }),
        scheduled({ id: "scheduled", name: "Tonight" }),
        active({ id: "active", name: "In force" }),
      ],
      NOW,
    );

    expect(ids(sorted)).toEqual(["active", "scheduled", "disabled", "expired"]);
  });

  it("orders in-force rules by the soonest expiry", () => {
    const sorted = sortSuppressionsForOperations(
      [
        active({ id: "later", endsAt: "2026-10-19T18:00:00.000Z" }),
        active({ id: "soonest", endsAt: "2026-10-19T11:00:00.000Z" }),
        active({ id: "middle", endsAt: "2026-10-19T14:00:00.000Z" }),
      ],
      NOW,
    );

    expect(ids(sorted)).toEqual(["soonest", "middle", "later"]);
  });

  it("orders scheduled rules by the soonest start", () => {
    const sorted = sortSuppressionsForOperations(
      [
        scheduled({
          id: "tomorrow",
          startsAt: "2026-10-20T09:00:00.000Z",
          endsAt: "2026-10-20T10:00:00.000Z",
        }),
        scheduled({
          id: "next-hour",
          startsAt: "2026-10-19T11:00:00.000Z",
          endsAt: "2026-10-19T12:00:00.000Z",
        }),
      ],
      NOW,
    );

    expect(ids(sorted)).toEqual(["next-hour", "tomorrow"]);
  });

  it("orders disabled rules by the most recent operator action", () => {
    const sorted = sortSuppressionsForOperations(
      [
        disabled({ id: "older", updatedAt: "2026-10-18T09:00:00.000Z" }),
        disabled({ id: "newer", updatedAt: "2026-10-19T09:30:00.000Z" }),
      ],
      NOW,
    );

    expect(ids(sorted)).toEqual(["newer", "older"]);
  });

  it("orders expired rules by the most recent end", () => {
    const sorted = sortSuppressionsForOperations(
      [
        expired({
          id: "long-ago",
          startsAt: "2026-10-17T07:00:00.000Z",
          endsAt: "2026-10-17T08:00:00.000Z",
        }),
        expired({
          id: "recent",
          startsAt: "2026-10-19T06:00:00.000Z",
          endsAt: "2026-10-19T07:00:00.000Z",
        }),
      ],
      NOW,
    );

    expect(ids(sorted)).toEqual(["recent", "long-ago"]);
  });

  it("falls back to newest creation time and id so ties stay stable", () => {
    const sorted = sortSuppressionsForOperations(
      [
        active({ id: "id-a", createdAt: "2026-10-19T08:00:00.000Z" }),
        active({ id: "id-c", createdAt: "2026-10-19T08:00:00.000Z" }),
        active({ id: "id-b", createdAt: "2026-10-19T09:00:00.000Z" }),
      ],
      NOW,
    );

    expect(ids(sorted)).toEqual(["id-b", "id-c", "id-a"]);
  });

  it("compares zoned timestamps as instants instead of strings", () => {
    const sorted = sortSuppressionsForOperations(
      [
        // 11:30Z, written with a Z suffix.
        active({ id: "utc", endsAt: "2026-10-19T11:30:00.000Z" }),
        // 11:00Z, written in +08:00. Lexically "19" > "11", so a string sort
        // would wrongly place it after the utc row.
        active({ id: "zoned", endsAt: "2026-10-19T19:00:00+08:00" }),
      ],
      NOW,
    );

    expect(ids(sorted)).toEqual(["zoned", "utc"]);
  });

  it("keeps rows with unparseable timestamps instead of dropping them", () => {
    const sorted = sortSuppressionsForOperations(
      [active({ id: "broken", endsAt: "not-a-date" }), expired({ id: "healthy" })],
      NOW,
    );

    expect(sorted).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const input = [expired({ id: "expired" }), active({ id: "active" })];

    sortSuppressionsForOperations(input, NOW);

    expect(ids(input)).toEqual(["expired", "active"]);
  });
});
