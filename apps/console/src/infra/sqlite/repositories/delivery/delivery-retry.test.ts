import { describe, expect, it } from "vite-plus/test";

import { DELIVERY_ACCEPTED_UNRECORDED_ERROR } from "@tocsin/core";

import { DeliveryAlreadyAcceptedError } from "#/infra/sqlite/repositories/delivery/delivery.interface";
import { openSqliteStore } from "#/infra/sqlite/store";

const now = "2026-06-07T00:00:00.000Z";
const failedAt = "2026-06-07T00:01:00.000Z";

/**
 * Seeds one delivery that failed terminally with `error`, mirroring what the
 * worker writes: a claimed attempt, then a `markFailed` with no retry left.
 */
async function seedFailedDelivery(error: string) {
  let nextId = 0;
  const store = await openSqliteStore({
    databasePath: ":memory:",
    now: () => now,
    ids: {
      event: () => `event-${++nextId}`,
      delivery: () => `delivery-${++nextId}`,
      attempt: () => `attempt-${++nextId}`,
    },
  });

  await store.sources.create({
    id: "source-1",
    name: "Grafana",
    provider: "grafana",
    tokenHash: "token-hash",
  });
  await store.destinations.create({
    id: "destination-1",
    name: "Ops webhook",
    kind: "generic_webhook",
    config: { url: "https://example.test/webhook" },
  });
  const route = await store.routes.create({
    id: "route-1",
    name: "All alerts",
    destinationIds: ["destination-1"],
  });
  const event = await store.intake.recordEvent({
    sourceId: "source-1",
    idempotencyKey: null,
    normalized: {
      title: "CPU high",
      message: "CPU is above threshold",
      severity: "critical",
      status: "firing",
      fingerprint: "cpu:api",
      labels: {},
      occurredAt: now,
    },
    rawPayload: {},
  });
  const delivery = (
    await store.deliveries.enqueueForEvent({
      event,
      matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
      dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
      maxAttempts: 1,
    })
  ).created[0]!;

  const claimed = await store.deliveries.claimNext({ limit: 1 });
  await store.deliveries.markFailed({
    deliveryId: delivery.id,
    attemptId: claimed[0]!.attempt.id,
    error,
    retryAt: null,
    responseStatus: 503,
    finishedAt: failedAt,
  });

  return { store, deliveryId: delivery.id };
}

describe("manual delivery retry", () => {
  it("refuses a delivery the destination already accepted and leaves the row untouched", async () => {
    const { store, deliveryId } = await seedFailedDelivery(DELIVERY_ACCEPTED_UNRECORDED_ERROR);
    const before = await store.deliveries.get(deliveryId);

    await expect(
      store.deliveries.retryNow({ deliveryId, requestedAt: "2026-06-07T00:02:00.000Z" }),
    ).rejects.toThrow(DeliveryAlreadyAcceptedError);

    const after = await store.deliveries.get(deliveryId);

    // Resending the alert would page on-call twice, so nothing may change:
    // not the state, not the attempt count, and not the retry ceiling.
    expect(after?.job).toEqual(before?.job);
    expect(after?.job).toMatchObject({
      state: "failed",
      attemptCount: 1,
      maxAttempts: 1,
      lastError: DELIVERY_ACCEPTED_UNRECORDED_ERROR,
    });
    expect(after?.attempts).toHaveLength(before?.attempts.length ?? 0);

    await store.close();
  });

  it("still re-queues an ordinary failed delivery", async () => {
    const { store, deliveryId } = await seedFailedDelivery("destination unavailable");

    const retried = await store.deliveries.retryNow({
      deliveryId,
      requestedAt: "2026-06-07T00:02:00.000Z",
    });

    expect(retried).toMatchObject({
      state: "pending",
      attemptCount: 1,
      maxAttempts: 2,
      nextAttemptAt: "2026-06-07T00:02:00.000Z",
      lastError: null,
      finishedAt: null,
    });

    await store.close();
  });
});
