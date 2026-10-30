import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

const event = (id: string, fingerprint: string, receivedAt: string) => ({
  id,
  source_id: "src-1",
  fingerprint,
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

async function repositoryWithDb() {
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

  // One event before the boundary and one exactly on it: the window is an
  // inclusive lower bound and an exclusive upper one, so both ends of each
  // comparison are pinned.
  await db
    .insertInto("events")
    .values([
      event("event-old", "fp-old", "2026-10-12T09:00:00.000Z"),
      event("event-new", "fp-new", "2026-10-12T09:30:00.000Z"),
    ])
    .execute();

  await db
    .insertInto("deliveries")
    .values([
      delivery("delivery-old", "event-old", "2026-10-12T09:00:00.000Z"),
      delivery("delivery-new", "event-new", "2026-10-12T09:30:00.000Z"),
    ])
    .execute();

  return { db, history: createSqliteRepositories(new SqliteRepositoryContext({ db })).history };
}

async function repositoryWithTwoWindows() {
  return (await repositoryWithDb()).history;
}

/**
 * Two jobs whose creation order and 更新时间 order disagree: the older one was
 * retried after the newer one arrived. A single timestamp column cannot stand
 * in for both, so the fixture exposes whichever column the query picked.
 */
async function repositoryWithRetriedDelivery() {
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
      event("event-old", "fp-old", "2026-10-12T09:00:00.000Z"),
      event("event-new", "fp-new", "2026-10-12T09:30:00.000Z"),
    ])
    .execute();

  await db
    .insertInto("deliveries")
    .values([
      {
        ...delivery("delivery-retried", "event-old", "2026-10-12T09:00:00.000Z"),
        state: "failed" as const,
        updated_at: "2026-10-12T09:40:00.000Z",
      },
      delivery("delivery-fresh", "event-new", "2026-10-12T09:30:00.000Z"),
    ])
    .execute();

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("history time range", () => {
  it("narrows events by an inclusive received_at lower bound", async () => {
    const repository = await repositoryWithTwoWindows();

    const page = await repository.listEvents({ since: "2026-10-12T09:30:00.000Z" });

    // The event exactly on the boundary is inside the window.
    expect(page.items.map((item) => item.id)).toEqual(["event-new"]);
    expect(page.total).toBe(1);
  });

  it("narrows deliveries by an inclusive created_at lower bound", async () => {
    const repository = await repositoryWithTwoWindows();

    const page = await repository.listDeliveries({ since: "2026-10-12T09:30:00.000Z" });

    expect(page.items.map((item) => item.id)).toEqual(["delivery-new"]);
    expect(page.total).toBe(1);
  });

  it("narrows events by an exclusive received_at upper bound", async () => {
    const repository = await repositoryWithTwoWindows();

    const page = await repository.listEvents({ until: "2026-10-12T09:30:00.000Z" });

    // Exclusive, unlike `since`: a row received at exactly the captured instant
    // was not part of the page the reader started from.
    expect(page.items.map((item) => item.id)).toEqual(["event-old"]);
    expect(page.total).toBe(1);
  });

  it("narrows deliveries by an exclusive created_at upper bound", async () => {
    const repository = await repositoryWithTwoWindows();

    const page = await repository.listDeliveries({ until: "2026-10-12T09:30:00.000Z" });

    expect(page.items.map((item) => item.id)).toEqual(["delivery-old"]);
    expect(page.total).toBe(1);
  });

  it("applies both bounds to events when a frozen page carries them together", async () => {
    const repository = await repositoryWithTwoWindows();

    const page = await repository.listEvents({
      since: "2026-10-12T09:00:00.000Z",
      until: "2026-10-12T09:30:00.000Z",
    });

    // Both predicates have to survive on the same query: dropping `since` would
    // leak rows older than the window, dropping `until` rows newer than it.
    expect(page.items.map((item) => item.id)).toEqual(["event-old"]);
    expect(page.total).toBe(1);
  });

  it("applies both bounds to deliveries when a frozen page carries them together", async () => {
    const repository = await repositoryWithTwoWindows();

    const page = await repository.listDeliveries({
      since: "2026-10-12T09:00:00.000Z",
      until: "2026-10-12T09:30:00.000Z",
    });

    expect(page.items.map((item) => item.id)).toEqual(["delivery-old"]);
    expect(page.total).toBe(1);
  });

  it("windows a retried delivery by 更新时间 when that field is selected", async () => {
    const repository = await repositoryWithRetriedDelivery();

    // `delivery-retried` was created before the window opens but retried into
    // it; `delivery-fresh` was created inside it. Selecting `updated` has to
    // move the bound to that column, and the default has to keep using
    // `created_at` — otherwise the two views would disagree about the same job.
    const updated = await repository.listDeliveries({
      timeField: "updated",
      until: "2026-10-12T09:35:00.000Z",
    });
    const created = await repository.listDeliveries({ until: "2026-10-12T09:35:00.000Z" });

    expect(updated.items.map((item) => item.id)).toEqual(["delivery-fresh"]);
    expect(updated.total).toBe(1);
    expect(created.items.map((item) => item.id).sort()).toEqual([
      "delivery-fresh",
      "delivery-retried",
    ]);
    expect(created.total).toBe(2);
  });

  it("orders a retried delivery by 更新时间 when that field is selected", async () => {
    const repository = await repositoryWithRetriedDelivery();

    // Same rows, opposite order: the retry is the newest visit even though it
    // is the oldest job, so the page has to sort by the selected column too.
    const updated = await repository.listDeliveries({ timeField: "updated", limit: 1 });
    const created = await repository.listDeliveries({ limit: 1 });

    expect(updated.items.map((item) => item.id)).toEqual(["delivery-retried"]);
    expect(created.items.map((item) => item.id)).toEqual(["delivery-fresh"]);
  });

  it("holds the page boundary still while newer events keep arriving", async () => {
    const { db, history } = await repositoryWithDb();

    // Newest first, one row per page: page 1 is `event-new`.
    const first = await history.listEvents({ limit: 1 });
    expect(first.items.map((item) => item.id)).toEqual(["event-new"]);

    // An alert lands after the reader loaded page 1 and before they ask for
    // page 2. Unbounded, the offset shifts by one and `event-new` is served
    // twice — the exact defect the frozen bound exists to prevent.
    await db
      .insertInto("events")
      .values(event("event-newest", "fp-newest", "2026-10-12T09:45:00.000Z"))
      .execute();

    const unbounded = await history.listEvents({ limit: 1, page: 2 });
    expect(unbounded.items.map((item) => item.id)).toEqual(["event-new"]);

    // Captured on the first page turn, the bound keeps the walk on the set the
    // reader started from.
    const bounded = await history.listEvents({
      limit: 1,
      page: 2,
      until: "2026-10-12T09:40:00.000Z",
    });
    expect(bounded.items.map((item) => item.id)).toEqual(["event-old"]);
    expect(bounded.total).toBe(2);
  });

  it("keeps the list and count in step when the window matches nothing", async () => {
    const repository = await repositoryWithTwoWindows();
    const since = "2026-10-12T11:00:00.000Z";

    const events = await repository.listEvents({ since });
    const deliveries = await repository.listDeliveries({ since });

    // A window with no rows is a normal page, not an error: the UI needs the
    // same shape it renders for every other empty result.
    expect(events).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
    expect(deliveries).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  });
});
