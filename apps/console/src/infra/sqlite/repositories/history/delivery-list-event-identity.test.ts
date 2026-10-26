import { describe, expect, it } from "vite-plus/test";

import { DeliveryListItemSchema } from "@tocsin/api/schemas";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const NOW = "2026-10-12T10:00:00.000Z";

async function repositoryWith(
  events: Array<{
    id: string;
    title: string;
    severity: "critical" | "warning" | "info";
    status: "firing" | "resolved";
  }>,
): Promise<ReturnType<typeof createSqliteRepositories>["history"]> {
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
      kind: "feishu",
      created_at: NOW,
      updated_at: NOW,
    })
    .execute();

  for (const event of events) {
    await db
      .insertInto("events")
      .values({
        id: event.id,
        source_id: "src-1",
        fingerprint: `fp-${event.id}`,
        severity: event.severity,
        status: event.status,
        title: event.title,
        message: "alert message",
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
      .values({
        id: `del-${event.id}`,
        event_id: event.id,
        destination_id: "dest-1",
        // Manual deliveries have no route; the identity projection must not
        // depend on route metadata.
        state: "pending",
        created_at: NOW,
        updated_at: NOW,
      })
      .execute();
  }

  return createSqliteRepositories(new SqliteRepositoryContext({ db })).history;
}

describe("delivery list event identity", () => {
  it("projects each delivery's own alert title, severity, and status", async () => {
    const repository = await repositoryWith([
      { id: "evt-1", title: "Disk full", severity: "critical", status: "firing" },
      { id: "evt-2", title: "Latency elevated", severity: "warning", status: "resolved" },
    ]);

    const page = await repository.listDeliveries();
    const byId = new Map(page.items.map((item) => [item.eventId, item]));

    expect(byId.get("evt-1")).toMatchObject({
      eventTitle: "Disk full",
      eventSeverity: "critical",
      eventStatus: "firing",
    });
    expect(byId.get("evt-2")).toMatchObject({
      eventTitle: "Latency elevated",
      eventSeverity: "warning",
      eventStatus: "resolved",
    });
  });

  it("keeps the identity fields on the wire schema", () => {
    const listItem = {
      id: "del-1",
      eventId: "evt-1",
      eventTitle: "Disk full",
      eventSeverity: "critical" as const,
      eventStatus: "firing" as const,
      sourceName: "Prometheus",
      destinationName: "Pager",
      routeName: null,
      providerReference: null,
      state: "pending" as const,
      attemptCount: 0,
      maxAttempts: 3,
      nextAttemptAt: null,
      lastError: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const parsed = DeliveryListItemSchema.parse(listItem);
    expect(parsed.eventTitle).toBe("Disk full");
    expect(parsed.eventSeverity).toBe("critical");
    expect(parsed.eventStatus).toBe("firing");
  });

  it("rejects an unknown severity or status instead of mislabelling the alert", () => {
    const listItem = {
      id: "del-1",
      eventId: "evt-1",
      eventTitle: "Disk full",
      eventSeverity: "critical",
      eventStatus: "firing",
      sourceName: "Prometheus",
      destinationName: "Pager",
      routeName: null,
      providerReference: null,
      state: "pending",
      attemptCount: 0,
      maxAttempts: 3,
      nextAttemptAt: null,
      lastError: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(DeliveryListItemSchema.safeParse({ ...listItem, eventSeverity: "urgent" }).success).toBe(
      false,
    );
    expect(DeliveryListItemSchema.safeParse({ ...listItem, eventStatus: "acked" }).success).toBe(
      false,
    );
  });
});
