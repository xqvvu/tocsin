import { describe, expect, it } from "vite-plus/test";

import type { RouteMatchResult } from "@tocsin/core";

import {
  deliveryTargetKey,
  routeMatchGaps,
  type RouteMatchGapInput,
} from "#/infra/sqlite/repositories/history/route-match-gaps";

function match(overrides: Partial<RouteMatchResult> = {}): RouteMatchResult {
  return {
    routeId: "route-1",
    routeName: "Critical to pager",
    matched: true,
    destinationIds: ["dest-1"],
    checks: [],
    ...overrides,
  };
}

function input(overrides: Partial<RouteMatchGapInput> = {}): RouteMatchGapInput {
  return {
    matches: [match()],
    deliveries: [],
    routes: [{ id: "route-1", enabled: true }],
    destinations: [{ id: "dest-1", name: "Pager", enabled: true }],
    dedupeFirstEvents: new Map(),
    ...overrides,
  };
}

describe("route match gaps", () => {
  it("reports nothing when every matched target was delivered", () => {
    expect(
      routeMatchGaps(input({ deliveries: [{ routeId: "route-1", destinationId: "dest-1" }] })),
    ).toEqual([]);
  });

  it("ignores routes that did not match", () => {
    // A route that did not match has no delivery by definition — explaining it
    // would fill the table with noise for every route in the instance.
    expect(routeMatchGaps(input({ matches: [match({ matched: false })] }))).toEqual([]);
  });

  it("emits a deleted route ONCE at route level, not per destination", () => {
    // The route is gone from `routes` but the snapshot still names it. Every
    // target it selected is undelivered for the same reason, so repeating the
    // sentence per target buries the pair-level gaps that actually differ.
    const gaps = routeMatchGaps(
      input({
        matches: [match({ destinationIds: ["dest-1", "dest-2", "dest-3"] })],
        routes: [],
      }),
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      routeId: "route-1",
      destinationId: null,
      destinationName: null,
      reason: "route_deleted",
    });
  });

  it("emits a disabled route ONCE at route level", () => {
    const gaps = routeMatchGaps(
      input({
        matches: [match({ destinationIds: ["dest-1", "dest-2"] })],
        routes: [{ id: "route-1", enabled: false }],
      }),
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ destinationId: null, reason: "route_disabled" });
  });

  it("does not report a route that delivered before it was disabled", () => {
    // The route was healthy at intake, so the delivery exists; it was disabled
    // afterwards. Judging the route before looking at deliveries would render
    // "route disabled" directly above the deliveries table showing that it sent.
    const gaps = routeMatchGaps(
      input({
        deliveries: [{ routeId: "route-1", destinationId: "dest-1" }],
        routes: [{ id: "route-1", enabled: false }],
      }),
    );

    expect(gaps).toEqual([]);
  });

  it("names only the missing target when a now-disabled route partly delivered", () => {
    // A route-level "all targets" row would condemn dest-1, which has a delivery.
    const gaps = routeMatchGaps(
      input({
        matches: [match({ destinationIds: ["dest-1", "dest-2"] })],
        deliveries: [{ routeId: "route-1", destinationId: "dest-1" }],
        routes: [{ id: "route-1", enabled: false }],
        destinations: [
          { id: "dest-1", name: "Pager", enabled: true },
          { id: "dest-2", name: "Chat", enabled: true },
        ],
      }),
    );

    expect(gaps).toEqual([
      {
        routeId: "route-1",
        routeName: "Critical to pager",
        destinationId: "dest-2",
        destinationName: "Chat",
        reason: "route_disabled",
        firstEventId: null,
      },
    ]);
  });

  it("does not report a disabled route that selected no destinations", () => {
    // Nothing was selected, so nothing was missed; the route-level row would
    // claim an undelivered target that never existed.
    const gaps = routeMatchGaps(
      input({
        matches: [match({ destinationIds: [] })],
        routes: [{ id: "route-1", enabled: false }],
      }),
    );

    expect(gaps).toEqual([]);
  });

  it("prefers route_deleted over route_disabled when both could apply", () => {
    // The ordered short-circuit: a route that no longer exists cannot also be
    // "merely disabled", and claiming both would contradict itself.
    const gaps = routeMatchGaps(input({ routes: [] }));

    expect(gaps[0]?.reason).toBe("route_deleted");
  });

  it("names the specific target when the route is healthy", () => {
    // One route often has a healthy destination beside a disabled one, so a
    // per-route verdict would be wrong for the healthy half.
    const gaps = routeMatchGaps(
      input({ destinations: [{ id: "dest-1", name: "Pager", enabled: false }] }),
    );

    expect(gaps).toEqual([
      {
        routeId: "route-1",
        routeName: "Critical to pager",
        destinationId: "dest-1",
        destinationName: "Pager",
        reason: "destination_disabled",
        firstEventId: null,
      },
    ]);
  });

  it("reports a destination that no longer exists, with no name to show", () => {
    const gaps = routeMatchGaps(input({ destinations: [] }));

    expect(gaps[0]).toMatchObject({
      destinationId: "dest-1",
      destinationName: null,
      reason: "destination_missing",
    });
  });

  it("explains a deduped pair and names the event that won", () => {
    const gaps = routeMatchGaps(
      input({ dedupeFirstEvents: new Map([["route-1|dest-1", "event-original"]]) }),
    );

    expect(gaps[0]).toMatchObject({
      reason: "duplicate_within_window",
      firstEventId: "event-original",
    });
  });

  it("says `unknown` rather than guessing once the dedupe row is pruned", () => {
    // The row lives ~5 minutes. Past that the reason is genuinely gone, and a
    // confident wrong answer would be worse than admitting it.
    const gaps = routeMatchGaps(input());

    expect(gaps[0]).toMatchObject({ reason: "unknown", firstEventId: null });
  });

  it("never silently drops an unexplainable pair", () => {
    // Silence reads as "no gap", which is the one thing this must not imply.
    // dest-2 is absent from the destination table, so it is explained as
    // missing; the point here is that BOTH pairs come back, neither dropped.
    const gaps = routeMatchGaps(
      input({ matches: [match({ destinationIds: ["dest-1", "dest-2"] })] }),
    );

    expect(gaps.map((gap) => gap.destinationId)).toEqual(["dest-1", "dest-2"]);
    expect(gaps.map((gap) => gap.reason)).toEqual(["unknown", "destination_missing"]);
  });

  it("classifies each pair independently within one route", () => {
    const gaps = routeMatchGaps(
      input({
        matches: [match({ destinationIds: ["dest-disabled", "dest-missing", "dest-ok"] })],
        deliveries: [{ routeId: "route-1", destinationId: "dest-ok" }],
        destinations: [{ id: "dest-disabled", name: "Muted", enabled: false }],
      }),
    );

    expect(gaps.map((gap) => [gap.destinationId, gap.reason]).sort()).toEqual([
      ["dest-disabled", "destination_disabled"],
      ["dest-missing", "destination_missing"],
    ]);
  });

  it("ignores deliveries with no route, which cannot fill a route-pair slot", () => {
    const gaps = routeMatchGaps(
      input({ deliveries: [{ routeId: null, destinationId: "dest-1" }] }),
    );

    expect(gaps).toHaveLength(1);
  });

  it("uses the same pair key the replay path already uses", () => {
    // Not an invented convention: event-replay.service.ts already keys pairs as
    // `routeId|destinationId`, and both sides must agree or a pair that exists
    // would look undelivered. Ids are UUIDs, which cannot contain the delimiter,
    // so the split is unambiguous in practice.
    expect(deliveryTargetKey("route-1", "dest-1")).toBe("route-1|dest-1");
  });
});
