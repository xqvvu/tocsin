import { describe, expect, it } from "vite-plus/test";

import type { DeliveryState } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

/**
 * One event per fan-out shape the coverage facet distinguishes: no delivery at
 * all, every delivery succeeded, a mix of succeeded and not, and the states
 * that never reached anyone on their own.
 */
async function repositoryWithCoverageFixtures(): Promise<
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
      // Outside every coverage value: this is the `deliveryOutcome=none` case.
      event("event-none", "src-1", "No route matched"),
      event("event-all", "src-1", "Both targets accepted"),
      event("event-partial", "src-1", "One target failed"),
      event("event-partial-pending", "src-1", "One target still queued"),
      event("event-failed", "src-2", "The only send failed"),
      event("event-suppressed", "src-2", "Silenced by a rule"),
      event("event-pending", "src-2", "Waiting for the worker"),
    ])
    .execute();

  const delivery = (id: string, eventId: string, destinationId: string, state: DeliveryState) => ({
    id,
    event_id: eventId,
    destination_id: destinationId,
    state,
    created_at: NOW,
    updated_at: NOW,
  });

  await db
    .insertInto("deliveries")
    .values([
      delivery("del-all-1", "event-all", "dest-1", "succeeded"),
      delivery("del-all-2", "event-all", "dest-2", "succeeded"),
      delivery("del-partial-1", "event-partial", "dest-1", "succeeded"),
      delivery("del-partial-2", "event-partial", "dest-2", "failed"),
      delivery("del-partial-pending-1", "event-partial-pending", "dest-1", "succeeded"),
      delivery("del-partial-pending-2", "event-partial-pending", "dest-2", "pending"),
      delivery("del-failed", "event-failed", "dest-1", "failed"),
      delivery("del-suppressed", "event-suppressed", "dest-1", "suppressed"),
      delivery("del-pending", "event-pending", "dest-1", "pending"),
    ])
    .execute();

  // Build the real repository set rather than hand-wiring the constructor, so
  // the test exercises the same object graph the app does.
  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

function eventIds(page: { items: Array<{ id: string }> }): string[] {
  return page.items.map((item) => item.id).sort();
}

describe("events filtered by delivery coverage", () => {
  it("keeps only events whose every delivery succeeded", async () => {
    const history = await repositoryWithCoverageFixtures();

    const page = await history.listEvents({ deliveryCoverage: "all" });

    expect(eventIds(page)).toEqual(["event-all"]);
    expect(page.total).toBe(1);
  });

  it("finds the alerts that reached some targets but not others", async () => {
    const history = await repositoryWithCoverageFixtures();

    const page = await history.listEvents({ deliveryCoverage: "partial" });

    // A queued job counts as "not delivered yet", so a succeeded-plus-pending
    // fan-out belongs with the mixed rows instead of the fully delivered one.
    expect(eventIds(page)).toEqual(["event-partial", "event-partial-pending"]);
    expect(page.total).toBe(2);
  });

  it("finds events that produced deliveries but reached nobody", async () => {
    const history = await repositoryWithCoverageFixtures();

    const page = await history.listEvents({ deliveryCoverage: "none" });

    // Failed, suppressed, and still-queued sends all mean "no human was
    // reached", which is the question the operator is asking.
    expect(eventIds(page)).toEqual(["event-failed", "event-pending", "event-suppressed"]);
    expect(page.total).toBe(3);
  });

  it("leaves events without any delivery outside the facet", async () => {
    const history = await repositoryWithCoverageFixtures();

    // `event-none` has no delivery row, so it matches no coverage value. That
    // half of "nobody was told" stays with `deliveryOutcome=none` instead of
    // being mixed into "deliveries were attempted and all failed".
    for (const coverage of ["all", "partial", "none"] as const) {
      const page = await history.listEvents({ deliveryCoverage: coverage });
      expect(eventIds(page)).not.toContain("event-none");
    }
  });

  it("counts the same rows the page returns", async () => {
    const history = await repositoryWithCoverageFixtures();

    const firstPage = await history.listEvents({ deliveryCoverage: "none", limit: 1 });

    // `total` drives the pagination footer, so it must apply the same predicate
    // as the page query instead of counting all events.
    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.page).toBe(1);
  });

  it("combines with the other event filters", async () => {
    const history = await repositoryWithCoverageFixtures();

    const narrowed = await history.listEvents({
      deliveryCoverage: "none",
      sourceId: "src-2",
    });

    expect(eventIds(narrowed)).toEqual(["event-failed", "event-pending", "event-suppressed"]);
    expect(narrowed.total).toBe(3);

    const otherSource = await history.listEvents({
      deliveryCoverage: "none",
      sourceId: "src-1",
    });

    expect(otherSource.items).toEqual([]);
    expect(otherSource.total).toBe(0);
  });
});
