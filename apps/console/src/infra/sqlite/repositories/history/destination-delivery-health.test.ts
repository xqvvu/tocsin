import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";
const SINCE = "2026-10-12T08:00:00.000Z";

/**
 * Two destinations with history and one without:
 *
 * - `dest-1` mixes every state, including a failure inside the window.
 * - `dest-2` only has outcomes older than the window.
 * - `dest-3` never received a delivery.
 */
async function repositoryWithDestinationHistory() {
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
        name: "Ops webhook",
        kind: "generic_webhook",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-2",
        name: "Legacy webhook",
        kind: "generic_webhook",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-3",
        name: "Never used",
        kind: "generic_webhook",
        created_at: NOW,
        updated_at: NOW,
      },
    ])
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
    .values(
      [
        {
          id: "del-1-succeeded",
          destination_id: "dest-1",
          state: "succeeded" as const,
          created_at: "2026-10-12T09:00:00.000Z",
          finished_at: "2026-10-12T09:00:05.000Z",
        },
        {
          id: "del-1-failed",
          destination_id: "dest-1",
          state: "failed" as const,
          created_at: "2026-10-12T09:30:00.000Z",
          finished_at: "2026-10-12T09:30:10.000Z",
        },
        {
          id: "del-1-pending",
          destination_id: "dest-1",
          state: "pending" as const,
          created_at: "2026-10-12T09:40:00.000Z",
        },
        {
          id: "del-1-running",
          destination_id: "dest-1",
          state: "running" as const,
          created_at: "2026-10-12T09:41:00.000Z",
        },
        {
          // Suppressed deliveries never send; they must not read as backlog.
          id: "del-1-suppressed",
          destination_id: "dest-1",
          state: "suppressed" as const,
          created_at: "2026-10-12T09:42:00.000Z",
        },
        {
          id: "del-2-failed-old",
          destination_id: "dest-2",
          state: "failed" as const,
          created_at: "2026-10-12T06:00:00.000Z",
          finished_at: "2026-10-12T06:00:05.000Z",
        },
        {
          id: "del-2-succeeded-old",
          destination_id: "dest-2",
          state: "succeeded" as const,
          created_at: "2026-10-12T05:00:00.000Z",
          finished_at: "2026-10-12T05:00:05.000Z",
        },
      ].map((delivery) => {
        const finishedAt = "finished_at" in delivery ? delivery.finished_at : null;

        return {
          ...delivery,
          event_id: "evt-1",
          attempt_count: 1,
          updated_at: finishedAt ?? delivery.created_at,
          finished_at: finishedAt,
        };
      }),
    )
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("destination delivery health", () => {
  it("aggregates the latest outcomes and the in-flight backlog per destination", async () => {
    const repository = await repositoryWithDestinationHistory();

    const rows = await repository.destinationDeliveryHealth({ since: SINCE });
    const byDestination = new Map(rows.map((row) => [row.destinationId, row]));

    expect(byDestination.get("dest-1")).toEqual({
      destinationId: "dest-1",
      lastSucceededAt: "2026-10-12T09:00:05.000Z",
      lastFailedAt: "2026-10-12T09:30:10.000Z",
      queuedCount: 2,
      recentFailureCount: 1,
    });
  });

  it("keeps failures older than the window in the last-failure fact but out of the count", async () => {
    const repository = await repositoryWithDestinationHistory();

    const rows = await repository.destinationDeliveryHealth({ since: SINCE });
    const byDestination = new Map(rows.map((row) => [row.destinationId, row]));

    expect(byDestination.get("dest-2")).toEqual({
      destinationId: "dest-2",
      lastSucceededAt: "2026-10-12T05:00:05.000Z",
      lastFailedAt: "2026-10-12T06:00:05.000Z",
      queuedCount: 0,
      recentFailureCount: 0,
    });
  });

  it("omits destinations that never received a delivery", async () => {
    const repository = await repositoryWithDestinationHistory();

    const rows = await repository.destinationDeliveryHealth({ since: SINCE });

    expect(rows.map((row) => row.destinationId).sort()).toEqual(["dest-1", "dest-2"]);
  });
});
