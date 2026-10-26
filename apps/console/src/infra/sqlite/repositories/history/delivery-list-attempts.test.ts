import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

/**
 * Three rows, one per attempt band, with distinct timestamps so the default
 * newest-first order is deterministic: `del-retried` (2), `del-once` (1),
 * `del-never` (0).
 */
async function repositoryWithAttempts(): Promise<
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
    .values({
      id: "dest-1",
      name: "Ops webhook",
      kind: "generic_webhook",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  await db
    .insertInto("events")
    .values({
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
    })
    .execute();

  const rows = [
    { id: "del-never", attempt_count: 0, created_at: "2026-10-12T09:00:00.000Z" },
    { id: "del-once", attempt_count: 1, created_at: "2026-10-12T10:00:00.000Z" },
    { id: "del-retried", attempt_count: 2, created_at: "2026-10-12T11:00:00.000Z" },
  ];

  await db
    .insertInto("deliveries")
    .values(
      rows.map((row) => ({
        id: row.id,
        event_id: "evt-1",
        destination_id: "dest-1",
        state: row.attempt_count === 0 ? ("pending" as const) : ("failed" as const),
        attempt_count: row.attempt_count,
        created_at: row.created_at,
        updated_at: row.created_at,
      })),
    )
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("delivery list retry budget", () => {
  it("projects each row's retry budget beside its attempt count", async () => {
    const db = createSqliteDatabase({ databasePath: ":memory:" });
    await migrateSqliteDatabase(db);
    const repository = createSqliteRepositories(new SqliteRepositoryContext({ db })).history;

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
      .values({
        id: "dest-1",
        name: "Ops webhook",
        kind: "generic_webhook",
        created_at: NOW,
        updated_at: NOW,
      })
      .execute();
    await db
      .insertInto("events")
      .values({
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
      })
      .execute();
    await db
      .insertInto("deliveries")
      .values([
        {
          id: "del-spent",
          event_id: "evt-1",
          destination_id: "dest-1",
          state: "failed" as const,
          attempt_count: 3,
          // Kysely fills a key missing from only some rows with NULL instead
          // of the column default, so spell out the schema default here.
          max_attempts: 3,
          created_at: "2026-10-12T09:00:00.000Z",
          updated_at: "2026-10-12T09:00:00.000Z",
        },
        {
          id: "del-widened",
          event_id: "evt-1",
          destination_id: "dest-1",
          state: "pending" as const,
          attempt_count: 3,
          max_attempts: 5,
          created_at: "2026-10-12T10:00:00.000Z",
          updated_at: "2026-10-12T10:00:00.000Z",
        },
      ])
      .execute();

    const page = await repository.listDeliveries();

    // The UI renders `attemptCount/maxAttempts`; a missing budget would make
    // an exhausted row and a manually retried row indistinguishable.
    expect(page.items.map((item) => [item.id, item.attemptCount, item.maxAttempts])).toEqual([
      ["del-widened", 3, 5],
      ["del-spent", 3, 3],
    ]);
  });
});

describe("delivery list attempt-count filter", () => {
  it("returns every delivery when no bound is set", async () => {
    const repository = await repositoryWithAttempts();

    const page = await repository.listDeliveries();

    expect(page.items.map((item) => item.id)).toEqual(["del-retried", "del-once", "del-never"]);
    expect(page.total).toBe(3);
  });

  it("excludes never-attempted jobs at a bound of one", async () => {
    const repository = await repositoryWithAttempts();

    const page = await repository.listDeliveries({ minAttempts: 1 });

    // The total comes from a separate count query; a predicate applied to only
    // one of them would page through rows the counter does not know about.
    expect(page.items.map((item) => item.id)).toEqual(["del-retried", "del-once"]);
    expect(page.total).toBe(2);
  });

  it("isolates jobs that were retried at least once", async () => {
    const repository = await repositoryWithAttempts();

    const page = await repository.listDeliveries({ minAttempts: 2 });

    expect(page.items.map((item) => item.id)).toEqual(["del-retried"]);
    expect(page.total).toBe(1);
  });

  it("returns an empty page when no job reached the bound", async () => {
    const repository = await repositoryWithAttempts();

    const page = await repository.listDeliveries({ minAttempts: 3 });

    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(0);
  });

  it("combines the bound with the other delivery filters", async () => {
    const repository = await repositoryWithAttempts();

    const page = await repository.listDeliveries({ minAttempts: 2, state: "failed" });

    expect(page.items.map((item) => item.id)).toEqual(["del-retried"]);
    expect(page.total).toBe(1);

    const mismatched = await repository.listDeliveries({ minAttempts: 2, state: "pending" });
    expect(mismatched.total).toBe(0);
  });
});
