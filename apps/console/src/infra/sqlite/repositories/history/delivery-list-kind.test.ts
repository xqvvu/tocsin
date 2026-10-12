import { describe, expect, it } from "vite-plus/test";

import { DeliveryListItemSchema, EventDetailDeliverySchema } from "@tocsin/api/schemas";
import type { DestinationKind } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

async function repositoryWith(seed: {
  destinationKind: DestinationKind;
  withDelivery: boolean;
}): Promise<ReturnType<typeof createSqliteRepositories>["history"]> {
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
      kind: seed.destinationKind,
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

  if (seed.withDelivery) {
    await db
      .insertInto("deliveries")
      .values({
        id: "del-1",
        event_id: "evt-1",
        destination_id: "dest-1",
        state: "pending",
        created_at: NOW,
        updated_at: NOW,
      })
      .execute();
  }

  // Build the real repository set rather than hand-wiring the constructor, so
  // the test exercises the same object graph the app does.
  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("delivery list destination kind", () => {
  it("carries the destination kind through to the list item", async () => {
    const repository = await repositoryWith({ destinationKind: "feishu", withDelivery: true });
    const page = await repository.listDeliveries();

    // The UI needs this to pick the right icon; without it the target cell can
    // only show a name.
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.destinationKind).toBe("feishu");
  });

  it("reports each destination's own kind, not a shared default", async () => {
    const repository = await repositoryWith({ destinationKind: "slack", withDelivery: true });
    const page = await repository.listDeliveries();

    expect(page.items[0]!.destinationKind).toBe("slack");
  });
});

describe("delivery schemas expose destinationKind", () => {
  const listItem = {
    id: "del-1",
    eventId: "evt-1",
    sourceName: "Prometheus",
    destinationName: "Pager",
    routeName: null,
    state: "pending" as const,
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    updatedAt: NOW,
  };

  it("keeps the kind on a delivery list item", () => {
    // Both schemas need the field: the deliveries page reads the list item,
    // while the event detail page reads the event-detail projection. Adding it
    // to only one is the failure this guards — it leaves one page icon-less.
    expect(
      DeliveryListItemSchema.parse({ ...listItem, destinationKind: "feishu" }).destinationKind,
    ).toBe("feishu");
  });

  it("keeps the kind on an event-detail delivery", () => {
    const eventDetailDelivery = {
      ...listItem,
      destinationId: "dest-1",
      routeId: null,
      maxAttempts: 3,
      createdAt: NOW,
      finishedAt: null,
    };

    expect(
      EventDetailDeliverySchema.parse({ ...eventDetailDelivery, destinationKind: "slack" })
        .destinationKind,
    ).toBe("slack");
  });

  it("accepts rows written before the field existed", () => {
    // Old snapshots must keep parsing, so the field is optional rather than
    // required — an icon-less row is better than a failed read.
    expect(DeliveryListItemSchema.parse(listItem).destinationKind).toBeUndefined();
    expect(
      EventDetailDeliverySchema.parse({
        ...listItem,
        destinationId: "dest-1",
        routeId: null,
        maxAttempts: 3,
        createdAt: NOW,
        finishedAt: null,
      }).destinationKind,
    ).toBeUndefined();
  });

  it("rejects an unknown kind instead of rendering the wrong icon", () => {
    expect(DeliveryListItemSchema.safeParse({ ...listItem, destinationKind: "nope" }).success).toBe(
      false,
    );
  });
});
