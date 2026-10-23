import { describe, expect, it } from "vite-plus/test";

import type { DeliveryState } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

/**
 * One event per fan-out shape: no delivery at all (no route matched, or a route
 * with no destination), a single state, and a mixed one that must show up under
 * every state it contains.
 */
async function repositoryWithOutcomeFixtures(): Promise<
  ReturnType<typeof createSqliteRepositories>["history"]
> {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);

  await db
    .insertInto("sources")
    .values([
      {
        id: "src-1",
        name: "Prometheus",
        provider: "generic",
        token_hash: "hash",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "src-2",
        name: "SigNoz",
        provider: "generic",
        token_hash: "hash-2",
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("destinations")
    .values({
      id: "dest-1",
      name: "Pager",
      kind: "generic_webhook" as const,
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  const event = (id: string, sourceId: string, title: string) => ({
    id,
    source_id: sourceId,
    fingerprint: `fp-${id}`,
    severity: "critical" as const,
    status: "firing" as const,
    title,
    message: title,
    labels_json: "{}",
    normalized_json: "{}",
    provider_metadata_json: "{}",
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    received_at: NOW,
    occurred_at: NOW,
    created_at: NOW,
  });

  await db
    .insertInto("events")
    .values([
      event("event-none", "src-1", "Nobody was told"),
      event("event-failed", "src-1", "Pager rejected"),
      event("event-succeeded", "src-1", "Pager accepted"),
      event("event-suppressed", "src-1", "Silenced by a rule"),
      event("event-pending", "src-2", "Waiting for the worker"),
      event("event-mixed", "src-2", "Reached one target, failed another"),
    ])
    .execute();

  const delivery = (id: string, eventId: string, state: DeliveryState) => ({
    id,
    event_id: eventId,
    destination_id: "dest-1",
    state,
    created_at: NOW,
    updated_at: NOW,
  });

  await db
    .insertInto("deliveries")
    .values([
      delivery("del-failed", "event-failed", "failed"),
      delivery("del-succeeded", "event-succeeded", "succeeded"),
      delivery("del-suppressed", "event-suppressed", "suppressed"),
      delivery("del-pending", "event-pending", "pending"),
      delivery("del-mixed-failed", "event-mixed", "failed"),
      delivery("del-mixed-succeeded", "event-mixed", "succeeded"),
    ])
    .execute();

  // Build the real repository set rather than hand-wiring the constructor, so
  // the test exercises the same object graph the app does.
  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

function eventIds(page: { items: Array<{ id: string }> }): string[] {
  return page.items.map((item) => item.id).sort();
}

describe("events filtered by delivery outcome", () => {
  it("finds the alerts that never produced a delivery", async () => {
    const history = await repositoryWithOutcomeFixtures();

    const page = await history.listEvents({ deliveryOutcome: "none" });

    // No route matched, or the matched route carried no destination: both look
    // the same here, and both are invisible in the deliveries list.
    expect(eventIds(page)).toEqual(["event-none"]);
    expect(page.total).toBe(1);
  });

  it("keeps every event that has at least one delivery in the state", async () => {
    const history = await repositoryWithOutcomeFixtures();

    const failed = await history.listEvents({ deliveryOutcome: "failed" });
    expect(eventIds(failed)).toEqual(["event-failed", "event-mixed"]);
    expect(failed.total).toBe(2);

    // A mixed fan-out answers to each state it contains, not to a single
    // "dominant" one, so the filter never hides a partial failure.
    const succeeded = await history.listEvents({ deliveryOutcome: "succeeded" });
    expect(eventIds(succeeded)).toEqual(["event-mixed", "event-succeeded"]);

    expect(eventIds(await history.listEvents({ deliveryOutcome: "suppressed" }))).toEqual([
      "event-suppressed",
    ]);
    expect(eventIds(await history.listEvents({ deliveryOutcome: "pending" }))).toEqual([
      "event-pending",
    ]);
    expect(eventIds(await history.listEvents({ deliveryOutcome: "running" }))).toEqual([]);
  });

  it("counts the same rows the page returns", async () => {
    const history = await repositoryWithOutcomeFixtures();

    const firstPage = await history.listEvents({ deliveryOutcome: "failed", limit: 1 });

    // `total` drives the pagination footer, so it must apply the same predicate
    // as the page query instead of counting all events.
    expect(firstPage.total).toBe(2);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.page).toBe(1);
  });

  it("combines with the other event filters", async () => {
    const history = await repositoryWithOutcomeFixtures();

    const narrowed = await history.listEvents({
      deliveryOutcome: "failed",
      sourceId: "src-2",
    });

    expect(eventIds(narrowed)).toEqual(["event-mixed"]);
    expect(narrowed.total).toBe(1);
  });
});
