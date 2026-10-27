import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

/**
 * Two events, three deliveries. `evt-1` fanned out twice (one still pending,
 * one already failed); `evt-2` produced a single pending delivery.
 */
async function repositoryWithTwoEvents(): Promise<
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
        id: "dest-primary",
        name: "Primary on-call",
        kind: "feishu",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-backup",
        name: "Backup on-call",
        kind: "slack",
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("events")
    .values([
      {
        id: "evt-1",
        source_id: "src-1",
        fingerprint: "fp-1",
        severity: "critical",
        status: "firing",
        title: "Disk full",
        message: "disk full",
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
        id: "evt-2",
        source_id: "src-1",
        fingerprint: "fp-2",
        severity: "warning",
        status: "firing",
        title: "Latency elevated",
        message: "p99 above budget",
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
        id: "del-1-pending",
        event_id: "evt-1",
        destination_id: "dest-primary",
        state: "pending",
        attempt_count: 0,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "del-1-failed",
        event_id: "evt-1",
        destination_id: "dest-backup",
        state: "failed",
        attempt_count: 3,
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "del-2-pending",
        event_id: "evt-2",
        destination_id: "dest-primary",
        state: "pending",
        attempt_count: 0,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("delivery list event filter", () => {
  it("narrows both the page and its total to one event", async () => {
    const repository = await repositoryWithTwoEvents();

    const page = await repository.listDeliveries({ eventId: "evt-1" });

    // The total comes from a separate count query; a filter applied to only one
    // of them would page through rows the counter does not know about.
    expect(page.items.map((item) => item.id).sort()).toEqual(["del-1-failed", "del-1-pending"]);
    expect(page.items.every((item) => item.eventId === "evt-1")).toBe(true);
    expect(page.total).toBe(2);
  });

  it("combines the event filter with a delivery state", async () => {
    const repository = await repositoryWithTwoEvents();

    const page = await repository.listDeliveries({ eventId: "evt-1", state: "failed" });

    expect(page.items.map((item) => item.id)).toEqual(["del-1-failed"]);
    expect(page.total).toBe(1);
  });

  it("returns an empty page for an unknown event instead of every delivery", async () => {
    const repository = await repositoryWithTwoEvents();

    const page = await repository.listDeliveries({ eventId: "evt-missing" });

    // A silently ignored filter would show the whole history under a chip that
    // claims one event is selected, which is worse than an honest empty page.
    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
  });

  it("leaves the list unfiltered when no event id is given", async () => {
    const repository = await repositoryWithTwoEvents();

    const page = await repository.listDeliveries();

    expect(page.total).toBe(3);
  });
});
