import { describe, expect, it } from "vite-plus/test";

import type { Suppression, SuppressionMatcher } from "@tocsin/core";

import {
  clearedSuppressionSearch,
  filterSuppressions,
  hasSuppressionFilters,
  mergeSuppressionSearch,
  pruneSuppressionSearch,
  SUPPRESSION_SEARCH_MAX_LENGTH,
  SuppressionListSearchSchema,
} from "#/features/suppressions/model/suppression-search";

const NOW = "2026-10-28T12:00:00.000Z";

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
    startsAt: "2026-10-28T11:00:00.000Z",
    endsAt: "2026-10-28T13:00:00.000Z",
    createdBy: null,
    createdAt: "2026-10-28T10:00:00.000Z",
    updatedAt: "2026-10-28T10:00:00.000Z",
    ...overrides,
  };
}

const active = suppression({ id: "active", name: "Active window" });
const scheduled = suppression({
  id: "scheduled",
  name: "Tonight",
  startsAt: "2026-10-28T20:00:00.000Z",
  endsAt: "2026-10-28T22:00:00.000Z",
});
const expired = suppression({
  id: "expired",
  name: "Yesterday",
  startsAt: "2026-10-27T10:00:00.000Z",
  endsAt: "2026-10-27T11:00:00.000Z",
});
const disabled = suppression({ id: "disabled", name: "Switched off", enabled: false });

const rules = [active, scheduled, expired, disabled];

function ids(suppressions: Suppression[]): string[] {
  return suppressions.map((row) => row.id);
}

describe("suppression list search", () => {
  it("returns every rule when nothing is narrowed", () => {
    expect(ids(filterSuppressions(rules, {}, NOW))).toEqual([
      "active",
      "scheduled",
      "expired",
      "disabled",
    ]);
  });

  it("filters by the derived lifecycle state at the caller's clock", () => {
    expect(ids(filterSuppressions(rules, { state: "active" }, NOW))).toEqual(["active"]);
    expect(ids(filterSuppressions(rules, { state: "scheduled" }, NOW))).toEqual(["scheduled"]);
    expect(ids(filterSuppressions(rules, { state: "expired" }, NOW))).toEqual(["expired"]);
    // `disabled` outranks `expired` for display, so a switched-off rule with a
    // lapsed window is only found under `disabled`.
    expect(ids(filterSuppressions(rules, { state: "disabled" }, NOW))).toEqual(["disabled"]);
  });

  it("re-derives the state as the clock moves", () => {
    expect(ids(filterSuppressions(rules, { state: "active" }, "2026-10-28T21:00:00.000Z"))).toEqual(
      ["scheduled"],
    );
  });

  it("filters by kind", () => {
    const silence = suppression({ id: "silence", kind: "silence" });

    expect(ids(filterSuppressions([active, silence], { kind: "silence" }, NOW))).toEqual([
      "silence",
    ]);
    expect(ids(filterSuppressions([active, silence], { kind: "maintenance_window" }, NOW))).toEqual(
      ["active"],
    );
  });

  it("requires every whitespace-separated term to match across the rule", () => {
    const rule = suppression({
      id: "scoped",
      name: "Checkout freeze",
      reason: "CHG-1234",
      matcher: matcher({
        fingerprints: ["checkout-500"],
        labels: [{ key: "service", operator: "equals", value: "payments" }],
        messageContains: ["connection refused"],
      }),
    });

    expect(ids(filterSuppressions([rule], { q: "checkout CHG-1234" }, NOW))).toEqual(["scoped"]);
    expect(ids(filterSuppressions([rule], { q: "SERVICE=payments" }, NOW))).toEqual(["scoped"]);
    expect(ids(filterSuppressions([rule], { q: "checkout refused" }, NOW))).toEqual(["scoped"]);
    // One term that matches nothing rejects the row even when the others do.
    expect(ids(filterSuppressions([rule], { q: "checkout grafana" }, NOW))).toEqual([]);
  });

  it("matches matcher ids and resolves them to operator-visible names", () => {
    const rule = suppression({
      id: "scoped",
      matcher: matcher({ sourceIds: ["source-1"], destinationIds: ["destination-1"] }),
    });
    const names = {
      sourceName: (id: string) => (id === "source-1" ? "Grafana" : undefined),
      destinationName: (id: string) => (id === "destination-1" ? "Ops webhook" : undefined),
    };

    expect(ids(filterSuppressions([rule], { q: "source-1" }, NOW))).toEqual(["scoped"]);
    expect(ids(filterSuppressions([rule], { q: "grafana" }, NOW, names))).toEqual(["scoped"]);
    expect(ids(filterSuppressions([rule], { q: "ops webhook" }, NOW, names))).toEqual(["scoped"]);
    // Without a resolver the id is still searchable, but the name is not
    // invented out of thin air.
    expect(ids(filterSuppressions([rule], { q: "grafana" }, NOW))).toEqual([]);
  });

  it("combines the state, kind, and keyword filters", () => {
    const scheduledSilence = suppression({
      id: "scheduled-silence",
      name: "Patch window",
      kind: "silence",
      startsAt: "2026-10-28T20:00:00.000Z",
      endsAt: "2026-10-28T22:00:00.000Z",
    });

    expect(
      ids(
        filterSuppressions(
          [active, scheduled, scheduledSilence],
          { state: "scheduled", kind: "silence", q: "patch" },
          NOW,
        ),
      ),
    ).toEqual(["scheduled-silence"]);
    expect(ids(filterSuppressions([active, scheduledSilence], { state: "active" }, NOW))).toEqual([
      "active",
    ]);
  });
});

describe("suppression search URL state", () => {
  it("drops empty values and clips an over-long query", () => {
    expect(pruneSuppressionSearch({ state: "", kind: "", q: "" })).toEqual({});
    expect(pruneSuppressionSearch({ state: "active", q: "checkout" })).toEqual({
      state: "active",
      q: "checkout",
    });

    const clipped = pruneSuppressionSearch({ q: "x".repeat(SUPPRESSION_SEARCH_MAX_LENGTH + 20) });

    expect(clipped.q).toHaveLength(SUPPRESSION_SEARCH_MAX_LENGTH);
  });

  it("keeps the operator's spacing while a query is being typed", () => {
    // Trimming on every keystroke would eat the space in "Disk usage"; only the
    // filter applies a trimmed view.
    expect(pruneSuppressionSearch({ q: "Disk " })).toEqual({ q: "Disk " });
  });

  it("merges one changed filter without losing the others", () => {
    expect(mergeSuppressionSearch({ state: "active", q: "db" }, { kind: "silence" })).toEqual({
      state: "active",
      kind: "silence",
      q: "db",
    });
    expect(mergeSuppressionSearch({ state: "active", q: "db" }, { state: "" })).toEqual({
      q: "db",
    });
  });

  it("treats a whitespace-only query as no filter", () => {
    expect(hasSuppressionFilters({ q: "   " })).toBe(false);
    expect(hasSuppressionFilters({ q: "db" })).toBe(true);
    expect(hasSuppressionFilters({ state: "active" })).toBe(true);
    expect(hasSuppressionFilters(clearedSuppressionSearch)).toBe(false);
  });

  it("falls back to any state for a hand-edited URL instead of throwing", () => {
    expect(SuppressionListSearchSchema.parse({ state: "bogus", kind: "bogus", q: 42 })).toEqual({
      state: "",
      kind: "",
      q: "",
    });
    expect(
      SuppressionListSearchSchema.parse({ state: "active", kind: "silence", q: "db" }),
    ).toEqual({ state: "active", kind: "silence", q: "db" });
  });
});
