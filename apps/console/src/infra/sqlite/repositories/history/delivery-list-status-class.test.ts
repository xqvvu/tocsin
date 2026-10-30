import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-30T10:00:00.000Z";

/**
 * Five deliveries, one per shape the status-class filter has to separate.
 *
 * The newest-first order is deterministic through `created_at`:
 * `del-latest-4xx`, `del-latest-5xx`, `del-recovered`, `del-timeout`,
 * `del-in-flight`.
 *
 * - `del-latest-4xx` failed with 500 and then 401 — the newest completed
 *   attempt decides, so it belongs to 4xx only.
 * - `del-latest-5xx` failed with 404 and then 503 — the reverse order.
 * - `del-recovered` failed with 502 but the retry succeeded with 200, so it
 *   must not stay in the 5xx list just because a 5xx attempt exists.
 * - `del-timeout` never received a response, so neither class matches.
 * - `del-in-flight` failed with 404 and is retrying right now; the running
 *   attempt has no response yet and must not hide the completed 404.
 */
async function repositoryWithAttemptStatuses(): Promise<
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

  await db
    .insertInto("deliveries")
    .values([
      {
        id: "del-latest-4xx",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "failed" as const,
        attempt_count: 2,
        max_attempts: 3,
        created_at: "2026-10-30T12:00:00.000Z",
        updated_at: "2026-10-30T12:00:00.000Z",
      },
      {
        id: "del-latest-5xx",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "failed" as const,
        attempt_count: 2,
        max_attempts: 3,
        created_at: "2026-10-30T11:00:00.000Z",
        updated_at: "2026-10-30T11:00:00.000Z",
      },
      {
        id: "del-recovered",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "succeeded" as const,
        attempt_count: 2,
        max_attempts: 3,
        created_at: "2026-10-30T10:00:00.000Z",
        updated_at: "2026-10-30T10:00:00.000Z",
      },
      {
        id: "del-timeout",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "failed" as const,
        attempt_count: 1,
        max_attempts: 3,
        created_at: "2026-10-30T09:00:00.000Z",
        updated_at: "2026-10-30T09:00:00.000Z",
      },
      {
        id: "del-in-flight",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "running" as const,
        attempt_count: 2,
        max_attempts: 3,
        created_at: "2026-10-30T08:00:00.000Z",
        updated_at: "2026-10-30T08:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("delivery_attempts")
    .values([
      {
        id: "att-4xx-1",
        delivery_id: "del-latest-4xx",
        attempt_number: 1,
        state: "failed" as const,
        response_status: 500,
        started_at: "2026-10-30T12:00:00.000Z",
        finished_at: "2026-10-30T12:00:00.000Z",
      },
      {
        id: "att-4xx-2",
        delivery_id: "del-latest-4xx",
        attempt_number: 2,
        state: "failed" as const,
        response_status: 401,
        started_at: "2026-10-30T12:01:00.000Z",
        finished_at: "2026-10-30T12:01:00.000Z",
      },
      {
        id: "att-5xx-1",
        delivery_id: "del-latest-5xx",
        attempt_number: 1,
        state: "failed" as const,
        response_status: 404,
        started_at: "2026-10-30T11:00:00.000Z",
        finished_at: "2026-10-30T11:00:00.000Z",
      },
      {
        id: "att-5xx-2",
        delivery_id: "del-latest-5xx",
        attempt_number: 2,
        state: "failed" as const,
        response_status: 503,
        started_at: "2026-10-30T11:01:00.000Z",
        finished_at: "2026-10-30T11:01:00.000Z",
      },
      {
        id: "att-recovered-1",
        delivery_id: "del-recovered",
        attempt_number: 1,
        state: "failed" as const,
        response_status: 502,
        started_at: "2026-10-30T10:00:00.000Z",
        finished_at: "2026-10-30T10:00:00.000Z",
      },
      {
        id: "att-recovered-2",
        delivery_id: "del-recovered",
        attempt_number: 2,
        state: "succeeded" as const,
        response_status: 200,
        started_at: "2026-10-30T10:01:00.000Z",
        finished_at: "2026-10-30T10:01:00.000Z",
      },
      {
        id: "att-timeout-1",
        delivery_id: "del-timeout",
        attempt_number: 1,
        state: "failed" as const,
        error: "connection timed out",
        started_at: "2026-10-30T09:00:00.000Z",
        finished_at: "2026-10-30T09:00:00.000Z",
      },
      {
        id: "att-in-flight-1",
        delivery_id: "del-in-flight",
        attempt_number: 1,
        state: "failed" as const,
        response_status: 404,
        started_at: "2026-10-30T08:00:00.000Z",
        finished_at: "2026-10-30T08:00:00.000Z",
      },
      {
        id: "att-in-flight-2",
        delivery_id: "del-in-flight",
        attempt_number: 2,
        state: "running" as const,
        started_at: "2026-10-30T08:01:00.000Z",
      },
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("delivery list latest-attempt status class", () => {
  it("returns every delivery when no class is set", async () => {
    const repository = await repositoryWithAttemptStatuses();

    const page = await repository.listDeliveries();

    expect(page.items.map((item) => item.id)).toEqual([
      "del-latest-4xx",
      "del-latest-5xx",
      "del-recovered",
      "del-timeout",
      "del-in-flight",
    ]);
    expect(page.total).toBe(5);
  });

  it("keeps only jobs whose newest completed attempt answered 4xx", async () => {
    const repository = await repositoryWithAttemptStatuses();

    const page = await repository.listDeliveries({ lastAttemptStatusClass: "4xx" });

    // `del-latest-4xx` ended on 401 even though its first attempt was a 500;
    // `del-in-flight` is retrying now, and a running attempt has no response
    // to outrank the completed 404.
    expect(page.items.map((item) => item.id)).toEqual(["del-latest-4xx", "del-in-flight"]);
    expect(page.total).toBe(2);
  });

  it("keeps only jobs whose newest completed attempt answered 5xx", async () => {
    const repository = await repositoryWithAttemptStatuses();

    const page = await repository.listDeliveries({ lastAttemptStatusClass: "5xx" });

    // `del-recovered` and `del-timeout` stay out: one recovered on a later
    // attempt, the other never received a status at all.
    expect(page.items.map((item) => item.id)).toEqual(["del-latest-5xx"]);
    expect(page.total).toBe(1);
  });

  it("combines the class with the other delivery filters", async () => {
    const repository = await repositoryWithAttemptStatuses();

    const failed = await repository.listDeliveries({
      lastAttemptStatusClass: "4xx",
      state: "failed",
    });

    expect(failed.items.map((item) => item.id)).toEqual(["del-latest-4xx"]);
    expect(failed.total).toBe(1);

    const mismatched = await repository.listDeliveries({
      lastAttemptStatusClass: "4xx",
      state: "succeeded",
    });
    expect(mismatched.items).toHaveLength(0);
    expect(mismatched.total).toBe(0);
  });
});
