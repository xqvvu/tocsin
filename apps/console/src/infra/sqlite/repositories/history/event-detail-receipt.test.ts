import { describe, expect, it } from "vite-plus/test";

import { EventDetailSchema } from "@tocsin/api/schemas";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";
const FIRST_ATTEMPT = "2026-10-12T10:00:05.000Z";
const RETRY_ATTEMPT = "2026-10-12T10:01:00.000Z";

/**
 * The event detail table answers "did the target accept this?" from the
 * delivery row and its latest completed attempt. These tests pin the
 * projection: the newest attempt wins, a still-running attempt exposes
 * nothing, and the DTO the UI consumes stays schema-valid.
 */
async function detailWithReceipts() {
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
        id: "dest-feishu",
        name: "Feishu group",
        kind: "feishu",
        created_at: NOW,
        updated_at: NOW,
      },
      {
        id: "dest-webhook",
        name: "Ops webhook",
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
    .values([
      {
        id: "del-retried",
        event_id: "evt-1",
        destination_id: "dest-feishu",
        state: "succeeded",
        attempt_count: 2,
        provider_ref_type: "feishu_message_id",
        provider_ref_value: "om_abc123",
        created_at: NOW,
        updated_at: RETRY_ATTEMPT,
        finished_at: RETRY_ATTEMPT,
      },
      {
        id: "del-sending",
        event_id: "evt-1",
        destination_id: "dest-webhook",
        state: "running",
        attempt_count: 1,
        created_at: NOW,
        updated_at: NOW,
      },
    ])
    .execute();

  await db
    .insertInto("delivery_attempts")
    .values([
      {
        id: "att-1",
        delivery_id: "del-retried",
        attempt_number: 1,
        state: "failed",
        response_status: 503,
        error: "target unavailable",
        started_at: FIRST_ATTEMPT,
        finished_at: FIRST_ATTEMPT,
      },
      {
        id: "att-2",
        delivery_id: "del-retried",
        attempt_number: 2,
        state: "succeeded",
        response_status: 200,
        started_at: RETRY_ATTEMPT,
        finished_at: RETRY_ATTEMPT,
      },
      {
        id: "att-3",
        delivery_id: "del-sending",
        attempt_number: 1,
        state: "running",
        started_at: NOW,
      },
    ])
    .execute();

  // Build the real repository set rather than hand-wiring the constructor, so
  // the test exercises the same object graph the app does.
  const repository = createSqliteRepositories(new SqliteRepositoryContext({ db })).history;

  return repository.getEventDetail("evt-1");
}

describe("event detail delivery receipts", () => {
  it("projects the latest completed attempt and the provider reference", async () => {
    const detail = await detailWithReceipts();
    const retried = detail?.deliveries.find((delivery) => delivery.id === "del-retried");

    expect(retried).toMatchObject({
      providerReference: { type: "feishu_message_id", value: "om_abc123" },
      lastResponseStatus: 200,
      lastResponseAt: RETRY_ATTEMPT,
    });
  });

  it("leaves the receipt empty while the only attempt is still running", async () => {
    const detail = await detailWithReceipts();
    const sending = detail?.deliveries.find((delivery) => delivery.id === "del-sending");

    expect(sending).toMatchObject({
      providerReference: null,
      lastResponseStatus: null,
      lastResponseAt: null,
    });
  });

  it("stays valid against the contract the console consumes", async () => {
    const detail = await detailWithReceipts();

    expect(() => EventDetailSchema.parse(detail)).not.toThrow();
  });
});
