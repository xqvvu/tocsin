import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-31T02:00:00.000Z";

/**
 * Route matches are the intake snapshot's promise: every destination a matched
 * route selected should have produced one delivery. These fixtures cover the
 * shapes the list projection has to tell apart — a real gap, a fully delivered
 * fan-out, the same destination selected twice, a route that matched nothing,
 * and an event with no snapshot at all.
 */
async function repositoryWithRouteSnapshotFixtures(): Promise<
  ReturnType<typeof createSqliteRepositories>["history"]
> {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);

  await db
    .insertInto("sources")
    .values({
      id: "src-1",
      name: "Prometheus",
      provider: "generic",
      token_hash: "hash",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  await db
    .insertInto("destinations")
    .values([
      {
        id: "dest-1",
        name: "Pager",
        kind: "generic_webhook" as const,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-2",
        name: "Chat",
        kind: "generic_webhook" as const,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  const routeMatch = (routeId: string, matched: boolean, destinationIds: string[]) => ({
    routeId,
    routeName: routeId,
    matched,
    destinationIds,
    checks: [],
  });

  const event = (id: string, routeMatches: unknown) => ({
    id,
    source_id: "src-1",
    fingerprint: `fp-${id}`,
    severity: "critical" as const,
    status: "firing" as const,
    title: id,
    message: id,
    labels_json: "{}",
    normalized_json: "{}",
    provider_metadata_json: "{}",
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    received_at: NOW,
    occurred_at: NOW,
    created_at: NOW,
    route_matches_json: routeMatches === null ? null : JSON.stringify(routeMatches),
  });

  await db
    .insertInto("events")
    .values([
      // Two matched routes selecting three target pairs in total; only one
      // delivery exists, so two were promised but never created.
      event("event-gap", [
        routeMatch("route-1", true, ["dest-1", "dest-2"]),
        routeMatch("route-2", true, ["dest-1"]),
      ]),
      // Every promised delivery exists.
      event("event-complete", [routeMatch("route-1", true, ["dest-1"])]),
      // The same destination selected by two routes is two delivery pairs,
      // not one distinct destination.
      event("event-two-routes-same-target", [
        routeMatch("route-1", true, ["dest-1"]),
        routeMatch("route-2", true, ["dest-1"]),
      ]),
      // A route that matched but selected no target promised nothing.
      event("event-matched-empty", [routeMatch("route-1", true, [])]),
      // Unmatched routes contribute neither a count nor an expectation.
      event("event-unmatched", [routeMatch("route-1", false, ["dest-1"])]),
      // No intake snapshot: the rules' intent was never recorded.
      event("event-no-snapshot", null),
    ])
    .execute();

  await db
    .insertInto("deliveries")
    .values([
      {
        id: "del-gap-1",
        event_id: "event-gap",
        destination_id: "dest-1",
        state: "succeeded" as const,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "del-complete-1",
        event_id: "event-complete",
        destination_id: "dest-1",
        state: "succeeded" as const,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

async function listItem(
  history: Awaited<ReturnType<typeof repositoryWithRouteSnapshotFixtures>>,
  eventId: string,
) {
  const page = await history.listEvents();
  const item = page.items.find((candidate) => candidate.id === eventId);

  if (!item) {
    throw new Error(`event ${eventId} missing from the list projection`);
  }

  return item;
}

describe("event list expected delivery count", () => {
  it("counts every route-destination pair the snapshot selected", async () => {
    const history = await repositoryWithRouteSnapshotFixtures();

    const item = await listItem(history, "event-gap");

    expect(item.routeMatchCount).toBe(2);
    expect(item.expectedDeliveryCount).toBe(3);
  });

  it("reports the promise even when every delivery already exists", async () => {
    const history = await repositoryWithRouteSnapshotFixtures();

    const item = await listItem(history, "event-complete");

    // The comparison is what makes the field useful: expected === fulfilled.
    expect(item.expectedDeliveryCount).toBe(1);
    expect(item.deliveryCounts.succeeded).toBe(1);
  });

  it("counts pairs, not distinct destinations", async () => {
    const history = await repositoryWithRouteSnapshotFixtures();

    const item = await listItem(history, "event-two-routes-same-target");

    expect(item.expectedDeliveryCount).toBe(2);
  });

  it("treats a matched route without targets as nothing promised", async () => {
    const history = await repositoryWithRouteSnapshotFixtures();

    const item = await listItem(history, "event-matched-empty");

    expect(item.routeMatchCount).toBe(1);
    expect(item.expectedDeliveryCount).toBe(0);
  });

  it("ignores unmatched routes", async () => {
    const history = await repositoryWithRouteSnapshotFixtures();

    const item = await listItem(history, "event-unmatched");

    expect(item.routeMatchCount).toBe(0);
    expect(item.expectedDeliveryCount).toBe(0);
  });

  it("returns null instead of zero when no intake snapshot exists", async () => {
    const history = await repositoryWithRouteSnapshotFixtures();

    const item = await listItem(history, "event-no-snapshot");

    // Events written directly (replay fixtures, parser-failure audit rows)
    // never recorded what the rules selected. Zero would claim "nothing was
    // expected", which the list cannot know.
    expect(item.routeMatchCount).toBe(0);
    expect(item.expectedDeliveryCount).toBeNull();
  });
});
