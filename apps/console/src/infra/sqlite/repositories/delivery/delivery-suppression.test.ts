import { describe, expect, it } from "vite-plus/test";

import type { AlertSeverity, AlertStatus } from "@tocsin/core";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import type { SqliteKysely } from "#/infra/sqlite/schema";
import type { SqliteRepositorySet } from "#/infra/sqlite/store";
import { createSqliteRepositories } from "#/infra/sqlite/store";

const ENQUEUE_AT = "2026-10-12T08:00:00.000Z";
const WINDOW_START = "2026-10-12T09:00:00.000Z";
const WINDOW_END = "2026-10-12T11:00:00.000Z";
const INSIDE_WINDOW = "2026-10-12T10:00:00.000Z";

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
        suppression: () => `suppression-${++nextId}`,
      },
    }),
  );

  return { db, repositories };
}

async function seedSourceRouteAndDestinations(repositories: SqliteRepositorySet): Promise<void> {
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
    now?: string;
    destinationIds?: string[];
    fingerprint?: string;
    labels?: Record<string, string>;
    severity?: AlertSeverity;
    status?: AlertStatus;
  },
) {
  const event = await repositories.intake.recordEvent({
    sourceId: "source-1",
    idempotencyKey: options.idempotencyKey,
    normalized: {
      title: "Disk usage above 95%",
      message: "disk usage is above 95%",
      severity: options.severity ?? "critical",
      status: options.status ?? "firing",
      fingerprint: options.fingerprint ?? "disk:full",
      labels: options.labels ?? { env: "prod" },
      occurredAt: ENQUEUE_AT,
    },
    rawPayload: {},
  });
  const enqueue = await repositories.deliveries.enqueueForEvent({
    event,
    matches: [{ routeId: "route-1", destinationIds: options.destinationIds ?? ["destination-1"] }],
    dedupeWindowStartsAt: "2026-10-12T07:00:00.000Z",
    now: options.now ?? ENQUEUE_AT,
  });

  return { event, enqueue };
}

describe("delivery suppression at the delivery layer", () => {
  it("creates a suppressed delivery with an audit snapshot when enqueued inside an active window", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);
    const rule = await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      matcher: {
        destinationIds: ["destination-1"],
        labels: [{ key: "env", value: "prod" }],
      },
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    const { enqueue } = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: INSIDE_WINDOW,
      destinationIds: ["destination-1", "destination-2"],
    });
    const [primary, secondary] = enqueue.created;

    expect(primary).toMatchObject({
      destinationId: "destination-1",
      state: "suppressed",
      suppressionId: rule.id,
      suppressedAt: INSIDE_WINDOW,
      suppressReason:
        "Maintenance window 「October database migration」 matched destination in [destination-1], label env=prod",
      attemptCount: 0,
      finishedAt: INSIDE_WINDOW,
    });
    // A rule scoped to one destination must leave its sibling alone.
    expect(secondary).toMatchObject({
      destinationId: "destination-2",
      state: "pending",
      suppressionId: null,
      suppressReason: null,
    });

    // The suppressed row is terminal: the worker can never claim it.
    const claimed = await repositories.deliveries.claimNext({ now: INSIDE_WINDOW, limit: 10 });

    expect(claimed.map((delivery) => delivery.job.destinationId)).toEqual(["destination-2"]);

    await db.destroy();
  });

  it("suppresses a delivery at claim time when the window opened after enqueue (PRD 2.4)", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);
    await repositories.suppressions.create({
      id: "suppression-1",
      name: "Noisy host",
      kind: "silence",
      matcher: { destinationIds: ["destination-1"] },
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    const { enqueue } = await enqueueDelivery(repositories, { idempotencyKey: "request-1" });

    // Enqueued before `startsAt`: the enqueue-time decision is correctly "send".
    expect(enqueue.created[0]?.state).toBe("pending");

    // The window opens while the delivery waits, so the claim must re-decide.
    const claimed = await repositories.deliveries.claimNext({ now: INSIDE_WINDOW, limit: 10 });

    expect(claimed).toEqual([]);

    const detail = await repositories.deliveries.get(enqueue.created[0]!.id);

    expect(detail?.job).toMatchObject({
      state: "suppressed",
      suppressionId: "suppression-1",
      suppressedAt: INSIDE_WINDOW,
      suppressReason: "Silence 「Noisy host」 matched destination in [destination-1]",
      attemptCount: 0,
      finishedAt: INSIDE_WINDOW,
    });
    // Claim-time suppression happens before an attempt row is created, so the
    // audit rule "a suppressed delivery has no attempts" still holds.
    expect(detail?.attempts).toEqual([]);

    await db.destroy();
  });

  it("suppresses a retry whose backoff lands inside the window", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);

    const { enqueue } = await enqueueDelivery(repositories, { idempotencyKey: "request-1" });
    const deliveryId = enqueue.created[0]!.id;
    const [claimed] = await repositories.deliveries.claimNext({ now: ENQUEUE_AT, limit: 10 });

    // First attempt fails while the window is still closed and schedules a retry.
    await repositories.deliveries.markFailed({
      deliveryId,
      attemptId: claimed!.attempt.id,
      error: "connection refused",
      retryAt: INSIDE_WINDOW,
      finishedAt: ENQUEUE_AT,
    });
    await repositories.suppressions.create({
      id: "suppression-1",
      name: "Noisy host",
      kind: "silence",
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    const reClaimed = await repositories.deliveries.claimNext({ now: INSIDE_WINDOW, limit: 10 });
    const detail = await repositories.deliveries.get(deliveryId);

    expect(reClaimed).toEqual([]);
    expect(detail?.job).toMatchObject({
      state: "suppressed",
      suppressionId: "suppression-1",
      suppressedAt: INSIDE_WINDOW,
      attemptCount: 1,
    });
    // The one attempt that did happen stays recorded; nothing new is attempted.
    expect(detail?.attempts.map((attempt) => attempt.state)).toEqual(["failed"]);

    await db.destroy();
  });

  it("delivers normally when both enqueue and claim fall outside the window", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);
    await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    const { enqueue } = await enqueueDelivery(repositories, { idempotencyKey: "request-1" });
    const claimed = await repositories.deliveries.claimNext({ now: ENQUEUE_AT, limit: 10 });

    expect(enqueue.created[0]?.state).toBe("pending");
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.job).toMatchObject({
      state: "running",
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      attemptCount: 1,
    });
    expect(claimed[0]?.attempt.state).toBe("running");

    await db.destroy();
  });

  it("treats the window as half-open: a rule ending exactly at claim time does not suppress", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);
    await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    const before = await enqueueDelivery(repositories, { idempotencyKey: "request-1" });
    const atEnd = await enqueueDelivery(repositories, {
      idempotencyKey: "request-2",
      now: WINDOW_END,
    });

    expect(before.enqueue.created[0]?.state).toBe("pending");
    expect(atEnd.enqueue.created[0]?.state).toBe("pending");

    const claimed = await repositories.deliveries.claimNext({ now: WINDOW_END, limit: 10 });

    expect(claimed).toHaveLength(2);
    expect(claimed.every((delivery) => delivery.job.state === "running")).toBe(true);

    await db.destroy();
  });

  it("keeps the suppress_reason snapshot readable after the rule is deleted", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);
    await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    const { enqueue } = await enqueueDelivery(repositories, {
      idempotencyKey: "request-1",
      now: INSIDE_WINDOW,
    });

    await repositories.suppressions.delete("suppression-1");

    const detail = await repositories.deliveries.get(enqueue.created[0]!.id);

    expect(detail?.job).toMatchObject({
      state: "suppressed",
      // The FK is `on delete set null`; the snapshot deliberately is not.
      suppressionId: null,
      suppressedAt: INSIDE_WINDOW,
      suppressReason:
        "Maintenance window 「October database migration」 matched no conditions (silences everything)",
    });

    await db.destroy();
  });

  it("never rewrites succeeded or failed deliveries when a window opens", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);
    const succeeded = await enqueueDelivery(repositories, { idempotencyKey: "request-1" });
    const failed = await enqueueDelivery(repositories, { idempotencyKey: "request-2" });
    const claimed = new Map(
      (await repositories.deliveries.claimNext({ now: ENQUEUE_AT, limit: 10 })).map((delivery) => [
        delivery.job.id,
        delivery,
      ]),
    );
    const succeededClaim = claimed.get(succeeded.enqueue.created[0]!.id)!;
    const failedClaim = claimed.get(failed.enqueue.created[0]!.id)!;

    await repositories.deliveries.markSucceeded({
      deliveryId: succeededClaim.job.id,
      attemptId: succeededClaim.attempt.id,
      providerReference: { type: "generic_webhook_receipt", value: "receipt-1" },
      finishedAt: ENQUEUE_AT,
    });
    await repositories.deliveries.markFailed({
      deliveryId: failedClaim.job.id,
      attemptId: failedClaim.attempt.id,
      error: "connection refused",
      retryAt: null,
      finishedAt: ENQUEUE_AT,
    });

    // An unconditional rule: if anything rewrote terminal rows, this would.
    await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    const claimedLater = await repositories.deliveries.claimNext({ now: INSIDE_WINDOW, limit: 10 });
    const succeededDetail = await repositories.deliveries.get(succeededClaim.job.id);
    const failedDetail = await repositories.deliveries.get(failedClaim.job.id);

    expect(claimedLater).toEqual([]);
    expect(succeededDetail?.job).toMatchObject({
      state: "succeeded",
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      finishedAt: ENQUEUE_AT,
    });
    expect(succeededDetail?.providerReference).toEqual({
      type: "generic_webhook_receipt",
      value: "receipt-1",
    });
    expect(failedDetail?.job).toMatchObject({
      state: "failed",
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      lastError: "connection refused",
      finishedAt: ENQUEUE_AT,
    });

    await db.destroy();
  });

  it("leaves pings already in flight untouched when a suppression window opens", async () => {
    const { db, repositories } = await openTestStore();
    await seedSourceRouteAndDestinations(repositories);
    const { event, enqueue } = await enqueueDelivery(repositories, { idempotencyKey: "request-1" });
    const deliveryId = enqueue.created[0]!.id;

    // Pages already fired and in flight for this alert before the window
    // opened. The on-call path has its own tests; what this pins is that
    // suppression never cancels, rewrites, or dedupes an in-flight ping.
    const pingRow = (id: string, receiver: string, state: "fired" | "running") => ({
      id,
      delivery_id: deliveryId,
      destination_id: "destination-1",
      event_id: event.id,
      fingerprint: "disk:full",
      receiver,
      channel: "feishu_urgent_phone",
      state,
      provider_ref_type: "feishu_message_id",
      provider_ref_value: `om_${receiver}`,
      trigger: "auto" as const,
      initiated_by: null,
      created_at: ENQUEUE_AT,
      updated_at: ENQUEUE_AT,
      fired_at: state === "fired" ? ENQUEUE_AT : null,
    });

    await db
      .insertInto("oncall_pings")
      .values(pingRow("ping-1", "ou_1", "fired"))
      .execute();
    await db
      .insertInto("oncall_pings")
      .values(pingRow("ping-2", "ou_2", "running"))
      .execute();
    await db
      .insertInto("oncall_ping_dedupe_keys")
      .values({
        fingerprint: "disk:full",
        destination_id: "destination-1",
        receiver: "ou_1",
        first_ping_id: "ping-1",
        created_at: ENQUEUE_AT,
      })
      .execute();
    await repositories.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      startsAt: WINDOW_START,
      endsAt: WINDOW_END,
    });

    await repositories.deliveries.claimNext({ now: INSIDE_WINDOW, limit: 10 });

    const pings = await repositories.oncall.listForDelivery(deliveryId);
    const dedupeKeys = await db.selectFrom("oncall_ping_dedupe_keys").selectAll().execute();
    const detail = await repositories.deliveries.get(deliveryId);

    expect(pings).toHaveLength(2);
    expect(pings.map((ping) => [ping.id, ping.state, ping.firedAt])).toEqual([
      ["ping-1", "fired", ENQUEUE_AT],
      ["ping-2", "running", null],
    ]);
    expect(pings.map((ping) => ping.updatedAt)).toEqual([ENQUEUE_AT, ENQUEUE_AT]);
    expect(pings.map((ping) => ping.providerReference?.value)).toEqual(["om_ou_1", "om_ou_2"]);
    expect(dedupeKeys).toHaveLength(1);
    // The delivery itself is suppressed from this claim on, so the paging hook
    // (which only runs on a successful send) cannot fire for it again.
    expect(detail?.job.state).toBe("suppressed");

    await db.destroy();
  });
});
