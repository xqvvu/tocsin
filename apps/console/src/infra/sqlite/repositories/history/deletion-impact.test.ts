import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-26T10:00:00.000Z";

/**
 * A source feeding one route into one destination, duplicated so each preview
 * has an unrelated sibling that must not be counted.
 *
 *   src-1 ──route-1──> dest-1
 *   src-2 ──route-2──> dest-2
 */
async function deletionFixtures() {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);
  const repositories = createSqliteRepositories(new SqliteRepositoryContext({ db }));

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
        name: "Audit channel",
        kind: "generic_webhook" as const,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("routes")
    .values([
      {
        id: "route-1",
        name: "Critical",
        rule_json: JSON.stringify({ sourceIds: ["src-1"], severities: ["critical"] }),
        destination_ids_json: JSON.stringify(["dest-1"]),
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "route-2",
        name: "Audit",
        rule_json: JSON.stringify({ sourceIds: ["src-2"], severities: [] }),
        destination_ids_json: JSON.stringify(["dest-2"]),
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("events")
    .values([
      {
        id: "event-1",
        source_id: "src-1",
        fingerprint: "fp-1",
        severity: "critical" as const,
        status: "firing" as const,
        title: "Disk full",
        message: "Disk full",
        labels_json: "{}",
        normalized_json: "{}",
        provider_metadata_json: "{}",
        raw_payload_json: "{}",
        raw_headers_json: "{}",
        received_at: NOW,
        occurred_at: NOW,
        created_at: NOW,
      },
      {
        id: "event-2",
        source_id: "src-2",
        fingerprint: "fp-2",
        severity: "warning" as const,
        status: "firing" as const,
        title: "Latency",
        message: "Latency",
        labels_json: "{}",
        normalized_json: "{}",
        provider_metadata_json: "{}",
        raw_payload_json: "{}",
        raw_headers_json: "{}",
        received_at: NOW,
        occurred_at: NOW,
        created_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("deliveries")
    .values([
      {
        id: "delivery-1",
        event_id: "event-1",
        destination_id: "dest-1",
        route_id: "route-1",
        state: "failed" as const,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "delivery-2",
        event_id: "event-2",
        destination_id: "dest-2",
        route_id: "route-2",
        state: "succeeded" as const,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("delivery_attempts")
    .values([
      {
        id: "attempt-1",
        delivery_id: "delivery-1",
        attempt_number: 1,
        state: "failed" as const,
        started_at: NOW,
      },
      {
        id: "attempt-2",
        delivery_id: "delivery-1",
        attempt_number: 2,
        state: "failed" as const,
        started_at: NOW,
      },
      {
        id: "attempt-3",
        delivery_id: "delivery-2",
        attempt_number: 1,
        state: "succeeded" as const,
        started_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("oncall_pings")
    .values([
      {
        id: "ping-1",
        delivery_id: "delivery-1",
        destination_id: "dest-1",
        event_id: "event-1",
        fingerprint: "fp-1",
        receiver: "oncall-a",
        channel: "phone",
        state: "fired" as const,
        trigger: "auto" as const,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "ping-2",
        delivery_id: "delivery-2",
        destination_id: "dest-2",
        event_id: "event-2",
        fingerprint: "fp-2",
        receiver: "oncall-b",
        channel: "phone",
        state: "fired" as const,
        trigger: "auto" as const,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  return repositories;
}

describe("deletion impact preview", () => {
  it("counts the source, its events, and everything hanging off them", async () => {
    const repositories = await deletionFixtures();

    expect(await repositories.history.countDeletionImpact({ sourceId: "src-1" })).toEqual({
      eventCount: 1,
      deliveryCount: 1,
      attemptCount: 2,
      oncallPingCount: 1,
    });
  });

  it("counts only the fan-out a route produced and keeps its events", async () => {
    const repositories = await deletionFixtures();

    expect(await repositories.history.countDeletionImpact({ routeId: "route-1" })).toEqual({
      eventCount: 0,
      deliveryCount: 1,
      attemptCount: 2,
      oncallPingCount: 1,
    });
  });

  it("counts the deliveries a destination received and keeps their events", async () => {
    const repositories = await deletionFixtures();

    expect(await repositories.history.countDeletionImpact({ destinationId: "dest-1" })).toEqual({
      eventCount: 0,
      deliveryCount: 1,
      attemptCount: 2,
      oncallPingCount: 1,
    });
  });

  it("agrees with the rows SQLite actually cascades away", async () => {
    const repositories = await deletionFixtures();
    const preview = await repositories.history.countDeletionImpact({ sourceId: "src-1" });

    await repositories.sources.delete("src-1");

    expect(preview.eventCount).toBe(1);
    expect(await repositories.history.countDeletionImpact({ sourceId: "src-1" })).toEqual({
      eventCount: 0,
      deliveryCount: 0,
      attemptCount: 0,
      oncallPingCount: 0,
    });

    // The unrelated source keeps every row, so the counts above were scoped.
    expect(await repositories.history.countDeletionImpact({ sourceId: "src-2" })).toEqual({
      eventCount: 1,
      deliveryCount: 1,
      attemptCount: 1,
      oncallPingCount: 1,
    });
  });
});
