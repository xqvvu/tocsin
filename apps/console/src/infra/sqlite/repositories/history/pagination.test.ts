import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-30T09:00:00.000Z";

const event = (id: string, receivedAt: string) => ({
  id,
  source_id: "src-1",
  fingerprint: `fp-${id}`,
  severity: "critical" as const,
  status: "firing" as const,
  title: `Alert ${id}`,
  message: "message",
  labels_json: "{}",
  normalized_json: "{}",
  provider_metadata_json: "{}",
  raw_payload_json: "{}",
  raw_headers_json: "{}",
  received_at: receivedAt,
  occurred_at: receivedAt,
  created_at: receivedAt,
});

const delivery = (id: string, eventId: string, createdAt: string) => ({
  id,
  event_id: eventId,
  destination_id: "dest-1",
  state: "pending" as const,
  created_at: createdAt,
  updated_at: createdAt,
});

/**
 * Three rows one minute apart, so newest-first order is unambiguous and a
 * page of two leaves exactly one row on the last page.
 */
async function repositoryWithThreeRows() {
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
      name: "Pager",
      kind: "generic_webhook",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  await db
    .insertInto("events")
    .values([
      event("event-1", "2026-10-30T09:20:00.000Z"),
      event("event-2", "2026-10-30T09:10:00.000Z"),
      event("event-3", "2026-10-30T09:00:00.000Z"),
    ])
    .execute();

  await db
    .insertInto("deliveries")
    .values([
      delivery("delivery-1", "event-1", "2026-10-30T09:20:00.000Z"),
      delivery("delivery-2", "event-2", "2026-10-30T09:10:00.000Z"),
      delivery("delivery-3", "event-3", "2026-10-30T09:00:00.000Z"),
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("history pagination", () => {
  it("clamps an events page past the end to the last page", async () => {
    const history = await repositoryWithThreeRows();

    const page = await history.listEvents({ limit: 2, page: 99 });

    // A stale URL or a filter that just shrank the result still has to render
    // rows; an unbounded offset would return an empty page that reads as an
    // outage. The reported page is the clamped one so the pager stays in step.
    expect(page).toEqual({
      items: [expect.objectContaining({ id: "event-3" })],
      total: 3,
      page: 2,
      pageSize: 2,
    });
  });

  it("clamps a deliveries page past the end to the last page", async () => {
    const history = await repositoryWithThreeRows();

    const page = await history.listDeliveries({ limit: 2, page: 99 });

    expect(page).toEqual({
      items: [expect.objectContaining({ id: "delivery-3" })],
      total: 3,
      page: 2,
      pageSize: 2,
    });
  });

  it("clamps a zero or negative page to the first page", async () => {
    const history = await repositoryWithThreeRows();

    const zero = await history.listEvents({ limit: 2, page: 0 });
    const negative = await history.listDeliveries({ limit: 2, page: -3 });

    // Paging controls can emit both while the user is mid-navigation; neither
    // may turn into a negative offset.
    expect(zero.page).toBe(1);
    expect(zero.items.map((item) => item.id)).toEqual(["event-1", "event-2"]);
    expect(negative.page).toBe(1);
    expect(negative.items.map((item) => item.id)).toEqual(["delivery-1", "delivery-2"]);
  });

  it("treats a zero limit as one row per page", async () => {
    const history = await repositoryWithThreeRows();

    const page = await history.listDeliveries({ limit: 0 });

    // A zero would otherwise divide into infinite pages and a `LIMIT 0` list.
    expect(page.pageSize).toBe(1);
    expect(page.page).toBe(1);
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual(["delivery-1"]);
  });

  it("keeps an empty result on page 1 however far the page is past the end", async () => {
    const history = await repositoryWithThreeRows();

    const events = await history.listEvents({ since: "2026-10-30T10:00:00.000Z", page: 99 });
    const deliveries = await history.listDeliveries({
      since: "2026-10-30T10:00:00.000Z",
      page: 99,
    });

    // No rows means one empty page, not page 0 or page 99.
    expect(events).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
    expect(deliveries).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  });
});
