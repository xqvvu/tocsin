import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import type { SqliteKysely } from "#/infra/sqlite/schema";
import type { SqliteRepositorySet } from "#/infra/sqlite/store";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const FIRST_ENQUEUE = "2026-10-12T08:00:00.000Z";
const SECOND_ENQUEUE = "2026-10-12T08:10:00.000Z";
const THIRD_ENQUEUE = "2026-10-12T08:20:00.000Z";
const NOW = "2026-10-12T08:30:00.000Z";
const LATER = "2026-10-12T09:00:00.000Z";

interface TestStore {
  db: SqliteKysely;
  repositories: SqliteRepositorySet;
}

async function openTestStore(): Promise<TestStore> {
  const clock = { now: NOW };
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
        suppression: () => `suppression-${++nextId}`,
      },
    }),
  );

  return { db, repositories };
}

async function seedConfiguration(repositories: SqliteRepositorySet): Promise<void> {
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
  await repositories.destinations.create({
    id: "destination-2",
    name: "Secondary webhook",
    kind: "generic_webhook",
    config: { url: "https://example.test/hooks/secondary" },
  });
  await repositories.routes.create({
    id: "route-1",
    name: "All alerts",
    destinationIds: ["destination-1", "destination-2"],
  });
}

async function enqueueDelivery(
  repositories: SqliteRepositorySet,
  options: {
    idempotencyKey: string;
    now: string;
    destinationId?: string;
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
      occurredAt: options.now,
    },
    rawPayload: {},
  });
  const enqueue = await repositories.deliveries.enqueueForEvent({
    event,
    matches: [{ routeId: "route-1", destinationIds: [options.destinationId ?? "destination-1"] }],
    dedupeWindowStartsAt: "2026-10-12T07:00:00.000Z",
    now: options.now,
  });

  return enqueue.created[0]!;
}

describe("delivery backlog summary", () => {
  it("counts claimable rows and reports the oldest created_at", async () => {
    const { db, repositories } = await openTestStore();
    await seedConfiguration(repositories);
    await enqueueDelivery(repositories, { idempotencyKey: "request-1", now: FIRST_ENQUEUE });
    await enqueueDelivery(repositories, {
      idempotencyKey: "request-2",
      now: SECOND_ENQUEUE,
      destinationId: "destination-2",
    });

    expect(await repositories.deliveries.summarizeClaimable({ now: NOW })).toEqual({
      claimable: 2,
      oldestCreatedAt: FIRST_ENQUEUE,
    });

    // A disabled destination keeps its rows pending but out of the claim set,
    // matching the worker's predicate.
    await db
      .updateTable("destinations")
      .set({ enabled: 0 })
      .where("id", "=", "destination-2")
      .execute();

    expect(await repositories.deliveries.summarizeClaimable({ now: NOW })).toEqual({
      claimable: 1,
      oldestCreatedAt: FIRST_ENQUEUE,
    });

    // The same holds for a disabled route.
    await db.updateTable("routes").set({ enabled: 0 }).where("id", "=", "route-1").execute();

    expect(await repositories.deliveries.summarizeClaimable({ now: NOW })).toEqual({
      claimable: 0,
      oldestCreatedAt: null,
    });

    await db.destroy();
  });

  it("excludes rows whose backoff has not elapsed or whose attempts are spent", async () => {
    const { db, repositories } = await openTestStore();
    await seedConfiguration(repositories);
    const first = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: FIRST_ENQUEUE,
    });
    const second = await enqueueDelivery(repositories, {
      idempotencyKey: "request-2",
      now: SECOND_ENQUEUE,
    });
    await enqueueDelivery(repositories, { idempotencyKey: "request-3", now: THIRD_ENQUEUE });

    await db
      .updateTable("deliveries")
      .set({ next_attempt_at: LATER })
      .where("id", "=", first.id)
      .execute();
    await db
      .updateTable("deliveries")
      .set({ attempt_count: 3, max_attempts: 3 })
      .where("id", "=", second.id)
      .execute();

    expect(await repositories.deliveries.summarizeClaimable({ now: NOW })).toEqual({
      claimable: 1,
      oldestCreatedAt: THIRD_ENQUEUE,
    });

    // Once the backoff lands, the older row is claimable again and becomes the
    // oldest wait even though it was enqueued first.
    await db
      .updateTable("deliveries")
      .set({ next_attempt_at: NOW })
      .where("id", "=", first.id)
      .execute();

    expect(await repositories.deliveries.summarizeClaimable({ now: NOW })).toEqual({
      claimable: 2,
      oldestCreatedAt: FIRST_ENQUEUE,
    });

    await db.destroy();
  });

  it("agrees with claimNext on the same fixture", async () => {
    const { db, repositories } = await openTestStore();
    await seedConfiguration(repositories);
    const claimable = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: FIRST_ENQUEUE,
    });
    await enqueueDelivery(repositories, {
      idempotencyKey: "request-2",
      now: SECOND_ENQUEUE,
      destinationId: "destination-2",
    });
    const backingOff = await enqueueDelivery(repositories, {
      idempotencyKey: "request-3",
      now: THIRD_ENQUEUE,
    });

    await db
      .updateTable("destinations")
      .set({ enabled: 0 })
      .where("id", "=", "destination-2")
      .execute();
    await db
      .updateTable("deliveries")
      .set({ next_attempt_at: LATER })
      .where("id", "=", backingOff.id)
      .execute();

    const summary = await repositories.deliveries.summarizeClaimable({ now: NOW });
    const claimed = await repositories.deliveries.claimNext({ now: NOW, limit: 100 });

    expect(summary.claimable).toBe(claimed.length);
    expect(summary.oldestCreatedAt).toBe(
      claimed
        .map((delivery) => delivery.job.createdAt)
        .sort((left, right) => left.localeCompare(right))[0] ?? null,
    );
    expect(claimed.map((delivery) => delivery.job.id)).toEqual([claimable.id]);

    await db.destroy();
  });
});
