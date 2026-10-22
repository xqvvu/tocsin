import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import type { SqliteKysely } from "#/infra/sqlite/schema";
import type { SqliteRepositorySet } from "#/infra/sqlite/store";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const ENQUEUE_AT = "2026-10-12T08:00:00.000Z";
const WINDOW_START = "2026-10-12T07:00:00.000Z";
const STALE_BASE = "2026-10-12T06:00:00.000Z";
const MESSAGE_REFERENCE = { type: "feishu_message_id", value: "om_123" };

interface TestStore {
  db: SqliteKysely;
  repositories: SqliteRepositorySet;
}

async function openTestStore(): Promise<TestStore> {
  const clock = { now: ENQUEUE_AT };
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);
  let nextId = 0;
  const repositories = createSqliteRepositories(
    new SqliteRepositoryContext({
      db,
      now: () => clock.now,
      ids: {
        delivery: () => `delivery-${++nextId}`,
        attempt: () => `attempt-${++nextId}`,
        oncallPing: () => `ping-${++nextId}`,
        suppression: () => `suppression-${++nextId}`,
      },
    }),
  );

  return { db, repositories };
}

async function seedSourceRouteAndDestination(repositories: SqliteRepositorySet): Promise<void> {
  await repositories.sources.create({
    id: "source-1",
    name: "Prometheus",
    provider: "generic",
    tokenHash: "hash",
  });
  await repositories.destinations.create({
    id: "destination-1",
    name: "Primary webhook",
    kind: "generic_webhook",
    config: { url: "https://example.test/hooks/primary" },
  });
  await repositories.routes.create({
    id: "route-1",
    name: "All alerts",
    destinationIds: ["destination-1"],
  });
}

async function enqueueDelivery(
  repositories: SqliteRepositorySet,
  options: {
    idempotencyKey: string;
    now?: string;
    windowStartsAt?: string;
    dedupeByIdempotency?: boolean;
  },
) {
  const event = await repositories.intake.recordEvent({
    sourceId: "source-1",
    idempotencyKey: options.idempotencyKey,
    normalized: {
      title: "Disk usage above 95%",
      message: "disk usage is above 95%",
      severity: "critical",
      status: "firing",
      fingerprint: "disk:full",
      labels: { env: "prod" },
      occurredAt: ENQUEUE_AT,
    },
    rawPayload: {},
  });
  const result = await repositories.deliveries.enqueueForEvent({
    event,
    matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
    dedupeWindowStartsAt: options.windowStartsAt ?? WINDOW_START,
    now: options.now ?? ENQUEUE_AT,
    dedupeByIdempotency: options.dedupeByIdempotency,
  });

  return { event, result };
}

async function enqueuePing(
  repositories: SqliteRepositorySet,
  options: {
    deliveryId: string;
    eventId: string;
    now?: string;
    windowStartsAt?: string;
    fingerprint?: string;
  },
) {
  return repositories.oncall.enqueueForDelivery({
    deliveryId: options.deliveryId,
    destinationId: "destination-1",
    eventId: options.eventId,
    fingerprint: options.fingerprint ?? "disk:full",
    receiver: "ou_operator",
    channel: "feishu_urgent_phone",
    providerReference: MESSAGE_REFERENCE,
    trigger: "manual",
    dedupeWindowStartsAt: options.windowStartsAt ?? WINDOW_START,
    now: options.now ?? ENQUEUE_AT,
  });
}

/** `count` strictly increasing stale timestamps, oldest first. */
function staleTimestamps(count: number): string[] {
  const base = new Date(STALE_BASE).valueOf();

  return Array.from({ length: count }, (_, index) => new Date(base + index).toISOString());
}

describe("delivery idempotency dedupe", () => {
  it("keeps suppressing inside the window without refreshing the key", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestination(repositories);

    const first = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: "2026-10-12T07:30:00.000Z",
    });
    const duplicate = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: "2026-10-12T07:31:00.000Z",
    });

    expect(first.result.created).toHaveLength(1);
    expect(duplicate.result.created).toHaveLength(0);
    expect(duplicate.result.deduped).toEqual([
      {
        sourceId: "source-1",
        idempotencyKey: "request-1",
        routeId: "route-1",
        destinationId: "destination-1",
        firstEventId: first.event.id,
      },
    ]);

    const key = await db.selectFrom("delivery_dedupe_keys").selectAll().executeTakeFirstOrThrow();

    // A hit must not extend the window, or a steady alert stream would never
    // stop being deduped.
    expect(key.created_at).toBe("2026-10-12T07:30:00.000Z");
    expect(key.first_event_id).toBe(first.event.id);

    await db.destroy();
  });

  it("treats the window start as inside and one millisecond earlier as outside", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestination(repositories);

    const atStart = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: WINDOW_START,
    });
    const stillInside = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: "2026-10-12T07:05:00.000Z",
    });
    const justOutside = await enqueueDelivery(repositories, {
      idempotencyKey: "request-2",
      now: "2026-10-12T06:59:59.999Z",
      windowStartsAt: "2026-10-12T06:00:00.000Z",
    });
    const afterExpiry = await enqueueDelivery(repositories, {
      idempotencyKey: "request-2",
      now: "2026-10-12T07:05:00.000Z",
    });

    expect(atStart.result.created).toHaveLength(1);
    expect(stillInside.result.deduped).toHaveLength(1);
    expect(stillInside.result.created).toHaveLength(0);
    expect(justOutside.result.created).toHaveLength(1);
    // The stale key must not suppress the new event; it starts a new window.
    expect(afterExpiry.result.created).toHaveLength(1);
    expect(afterExpiry.result.deduped).toHaveLength(0);

    const refreshed = await db
      .selectFrom("delivery_dedupe_keys")
      .selectAll()
      .where("idempotency_key", "=", "request-2")
      .executeTakeFirstOrThrow();

    expect(refreshed.created_at).toBe("2026-10-12T07:05:00.000Z");
    expect(refreshed.first_event_id).toBe(afterExpiry.event.id);

    await db.destroy();
  });

  it("takes over a stale key the bounded prune has not reached", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestination(repositories);
    const anchorEvent = await repositories.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: null,
      normalized: {
        title: "Anchor",
        message: "anchor event for stale dedupe keys",
        severity: "info",
        status: "firing",
        fingerprint: "anchor",
        labels: {},
        occurredAt: ENQUEUE_AT,
      },
      rawPayload: {},
    });
    // 249 synthetic stale keys plus the target; the target is the newest, so a
    // 100-row batch leaves it untouched and the enqueue has to handle it.
    const timestamps = staleTimestamps(250);

    await db
      .insertInto("delivery_dedupe_keys")
      .values(
        timestamps.map((createdAt, index) => ({
          source_id: "source-1",
          idempotency_key: index === 249 ? "request-target" : `stale-${index}`,
          route_id: "route-1",
          destination_id: "destination-1",
          first_event_id: anchorEvent.id,
          created_at: createdAt,
        })),
      )
      .execute();

    const { event, result } = await enqueueDelivery(repositories, {
      idempotencyKey: "request-target",
    });

    // A plain INSERT would abort here on the four-column primary key and roll
    // back the whole webhook transaction.
    expect(result.created).toHaveLength(1);
    expect(result.deduped).toHaveLength(0);

    const remaining = await db
      .selectFrom("delivery_dedupe_keys")
      .selectAll()
      .orderBy("created_at")
      .execute();

    // One batch only: 250 stale rows, 100 pruned, the target overwritten.
    expect(remaining).toHaveLength(150);
    expect(remaining[0]?.created_at).toBe(timestamps[100]);
    expect(remaining.at(-1)).toMatchObject({
      idempotency_key: "request-target",
      created_at: ENQUEUE_AT,
      first_event_id: event.id,
    });

    await db.destroy();
  });

  it("skips dedupe entirely for replayed events", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestination(repositories);

    const first = await enqueueDelivery(repositories, {
      idempotencyKey: "request-replay",
      dedupeByIdempotency: false,
    });
    const second = await enqueueDelivery(repositories, {
      idempotencyKey: "request-replay",
      dedupeByIdempotency: false,
    });

    expect(first.result.created).toHaveLength(1);
    expect(second.result.created).toHaveLength(1);
    expect(await db.selectFrom("delivery_dedupe_keys").selectAll().execute()).toHaveLength(0);

    await db.destroy();
  });
});

describe("oncall ping dedupe", () => {
  it("suppresses inside the window and pages again after it expires", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestination(repositories);
    const { event, result } = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: "2026-10-12T07:30:00.000Z",
    });
    const deliveryId = result.created[0]!.id;

    const first = await enqueuePing(repositories, {
      deliveryId,
      eventId: event.id,
      now: "2026-10-12T07:30:00.000Z",
    });
    const inside = await enqueuePing(repositories, {
      deliveryId,
      eventId: event.id,
      now: "2026-10-12T07:34:59.999Z",
    });
    const atBoundary = await enqueuePing(repositories, {
      deliveryId,
      eventId: event.id,
      now: "2026-10-12T07:35:00.000Z",
      windowStartsAt: "2026-10-12T07:30:00.000Z",
    });
    const afterExpiry = await enqueuePing(repositories, {
      deliveryId,
      eventId: event.id,
      now: "2026-10-12T07:35:00.001Z",
      windowStartsAt: "2026-10-12T07:30:00.001Z",
    });

    expect(first).not.toBeNull();
    expect(inside).toBeNull();
    // `created_at == windowStartsAt` is still inside the window.
    expect(atBoundary).toBeNull();
    expect(afterExpiry).not.toBeNull();

    const key = await db
      .selectFrom("oncall_ping_dedupe_keys")
      .selectAll()
      .executeTakeFirstOrThrow();

    expect(key.created_at).toBe("2026-10-12T07:35:00.001Z");
    expect(key.first_ping_id).toBe(afterExpiry!.id);

    await db.destroy();
  });

  it("takes over a stale key the bounded prune has not reached", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestination(repositories);
    const { event, result } = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: "2026-10-12T07:30:00.000Z",
    });
    const deliveryId = result.created[0]!.id;
    const warmup = await enqueuePing(repositories, {
      deliveryId,
      eventId: event.id,
      now: "2026-10-12T07:30:00.000Z",
      fingerprint: "warmup",
    });
    await db.deleteFrom("oncall_ping_dedupe_keys").execute();

    const timestamps = staleTimestamps(250);

    await db
      .insertInto("oncall_ping_dedupe_keys")
      .values(
        timestamps.map((createdAt, index) => ({
          fingerprint: index === 249 ? "disk:full" : `stale-${index}`,
          destination_id: "destination-1",
          receiver: "ou_operator",
          first_ping_id: warmup!.id,
          created_at: createdAt,
        })),
      )
      .execute();

    const ping = await enqueuePing(repositories, { deliveryId, eventId: event.id });

    expect(ping).not.toBeNull();

    const remaining = await db
      .selectFrom("oncall_ping_dedupe_keys")
      .selectAll()
      .orderBy("created_at")
      .execute();

    expect(remaining).toHaveLength(150);
    expect(remaining[0]?.created_at).toBe(timestamps[100]);
    expect(remaining.at(-1)).toMatchObject({
      fingerprint: "disk:full",
      created_at: ENQUEUE_AT,
      first_ping_id: ping!.id,
    });

    await db.destroy();
  });
});
