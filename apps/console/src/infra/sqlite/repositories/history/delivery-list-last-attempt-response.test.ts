import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-30T10:00:00.000Z";

/**
 * Five deliveries, one per shape the response filter has to separate.
 *
 * Newest-first order through `created_at`: `del-answered`, `del-timeout-latest`,
 * `del-recovered`, `del-in-flight`, `del-queued`.
 *
 * - `del-answered` got a 503 — a response, whatever its class.
 * - `del-timeout-latest` answered once and then timed out on the retry, so the
 *   newest completed attempt has no response and it belongs to `missing` only.
 * - `del-recovered` timed out first and got a 200 on the retry, so it belongs
 *   to `received` only.
 * - `del-in-flight` timed out and is retrying right now; the running attempt
 *   has no outcome yet and must not hide the completed timeout.
 * - `del-queued` was never attempted, so it has no "latest attempt" and matches
 *   neither value.
 */
async function repositoryWithAttemptResponses(): Promise<
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
        id: "del-answered",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "failed" as const,
        attempt_count: 1,
        max_attempts: 3,
        created_at: "2026-10-30T12:00:00.000Z",
        updated_at: "2026-10-30T12:00:00.000Z",
      },
      {
        id: "del-timeout-latest",
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
        id: "del-in-flight",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "running" as const,
        attempt_count: 2,
        max_attempts: 3,
        created_at: "2026-10-30T09:00:00.000Z",
        updated_at: "2026-10-30T09:00:00.000Z",
      },
      {
        id: "del-queued",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "pending" as const,
        attempt_count: 0,
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
        id: "att-answered-1",
        delivery_id: "del-answered",
        attempt_number: 1,
        state: "failed" as const,
        response_status: 503,
        started_at: "2026-10-30T12:00:00.000Z",
        finished_at: "2026-10-30T12:00:00.000Z",
      },
      {
        id: "att-timeout-1",
        delivery_id: "del-timeout-latest",
        attempt_number: 1,
        state: "failed" as const,
        response_status: 200,
        started_at: "2026-10-30T11:00:00.000Z",
        finished_at: "2026-10-30T11:00:00.000Z",
      },
      {
        id: "att-timeout-2",
        delivery_id: "del-timeout-latest",
        attempt_number: 2,
        state: "failed" as const,
        error: "connection timed out",
        started_at: "2026-10-30T11:01:00.000Z",
        finished_at: "2026-10-30T11:01:00.000Z",
      },
      {
        id: "att-recovered-1",
        delivery_id: "del-recovered",
        attempt_number: 1,
        state: "failed" as const,
        error: "getaddrinfo ENOTFOUND hooks.example.test",
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
        id: "att-in-flight-1",
        delivery_id: "del-in-flight",
        attempt_number: 1,
        state: "failed" as const,
        error: "TLS handshake timeout",
        started_at: "2026-10-30T09:00:00.000Z",
        finished_at: "2026-10-30T09:00:00.000Z",
      },
      {
        id: "att-in-flight-2",
        delivery_id: "del-in-flight",
        attempt_number: 2,
        state: "running" as const,
        started_at: "2026-10-30T09:01:00.000Z",
      },
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("delivery list latest-attempt response", () => {
  it("returns every delivery when no response filter is set", async () => {
    const repository = await repositoryWithAttemptResponses();

    const page = await repository.listDeliveries();

    expect(page.items.map((item) => item.id)).toEqual([
      "del-answered",
      "del-timeout-latest",
      "del-recovered",
      "del-in-flight",
      "del-queued",
    ]);
    expect(page.total).toBe(5);
  });

  it("keeps only jobs whose newest completed attempt received a response", async () => {
    const repository = await repositoryWithAttemptResponses();

    const page = await repository.listDeliveries({ lastAttemptResponse: "received" });

    // `del-timeout-latest` answered once but its newest completed attempt did
    // not, and `del-in-flight` is retrying without a completed second attempt.
    expect(page.items.map((item) => item.id)).toEqual(["del-answered", "del-recovered"]);
    expect(page.total).toBe(2);
  });

  it("keeps only jobs whose newest completed attempt ended without a response", async () => {
    const repository = await repositoryWithAttemptResponses();

    const page = await repository.listDeliveries({ lastAttemptResponse: "missing" });

    // `del-recovered` timed out once but the retry answered; `del-queued` has
    // no attempt at all, so it has no latest outcome to classify.
    expect(page.items.map((item) => item.id)).toEqual(["del-timeout-latest", "del-in-flight"]);
    expect(page.total).toBe(2);
  });

  it("matches no never-attempted job in either bucket", async () => {
    const repository = await repositoryWithAttemptResponses();

    const received = await repository.listDeliveries({ lastAttemptResponse: "received" });
    const missing = await repository.listDeliveries({ lastAttemptResponse: "missing" });

    const classified = [...received.items, ...missing.items].map((item) => item.id);
    expect(classified).not.toContain("del-queued");
    // The two buckets partition the attempted jobs: each row is in exactly one.
    expect(classified).toHaveLength(4);
    expect(new Set(classified).size).toBe(4);
  });

  it("combines the response with the other delivery filters", async () => {
    const repository = await repositoryWithAttemptResponses();

    const failedWithoutResponse = await repository.listDeliveries({
      lastAttemptResponse: "missing",
      state: "failed",
    });

    expect(failedWithoutResponse.items.map((item) => item.id)).toEqual(["del-timeout-latest"]);
    expect(failedWithoutResponse.total).toBe(1);

    const succeededWithoutResponse = await repository.listDeliveries({
      lastAttemptResponse: "missing",
      state: "succeeded",
    });
    expect(succeededWithoutResponse.items).toHaveLength(0);
    expect(succeededWithoutResponse.total).toBe(0);
  });
});
