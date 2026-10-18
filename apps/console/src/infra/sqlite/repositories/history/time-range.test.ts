import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

async function repositoryWithTwoWindows(): Promise<
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
      name: "Pager",
      kind: "generic_webhook",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

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

  // One event before the boundary and one exactly on it: the window is an
  // inclusive lower bound, so both ends of the comparison are pinned.
  await db
    .insertInto("events")
    .values([
      event("event-old", "fp-old", "2026-10-12T09:00:00.000Z"),
      event("event-new", "fp-new", "2026-10-12T09:30:00.000Z"),
    ])
    .execute();

  const delivery = (id: string, eventId: string, createdAt: string) => ({
    id,
    event_id: eventId,
    destination_id: "dest-1",
    state: "pending" as const,
    created_at: createdAt,
    updated_at: createdAt,
  });

  await db
    .insertInto("deliveries")
    .values([
      delivery("delivery-old", "event-old", "2026-10-12T09:00:00.000Z"),
      delivery("delivery-new", "event-new", "2026-10-12T09:30:00.000Z"),
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
