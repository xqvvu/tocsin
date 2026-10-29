import { describe, expect, it } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import { openSqliteStore } from "#/infra/sqlite/store";
import { DestinationService } from "#/server/destinations/destination.service";

const now = "2026-10-29T08:00:00.000Z";
const dedupeWindowStartsAt = "2026-10-29T07:55:00.000Z";
const providerReference = { type: "feishu_message_id" as const, value: "om_1" };

async function createStore() {
  return openSqliteStore({ databasePath: ":memory:", now: () => now });
}

function createService(store: Awaited<ReturnType<typeof createStore>>) {
  return new DestinationService({
    store,
    destinations: createDefaultDestinationRegistry(),
  });
}

describe("destination enable preview", () => {
  it("counts the urgent calls that would start dialing on enable", async () => {
    const store = await createStore();
    const service = createService(store);
    const job = await seedDelivery(store);

    const first = await enqueuePing(store, job.id, "ou_1");
    await enqueuePing(store, job.id, "ou_2");

    expect(await service.previewEnableDestination({ id: "destination-1" })).toEqual({
      scheduledUrgentCallCount: 2,
    });

    // A placed call is no longer waiting, even though its row stays behind as
    // evidence.
    await store.oncall.markFired({ pingId: first!.id, firedAt: now });

    expect(await service.previewEnableDestination({ id: "destination-1" })).toEqual({
      scheduledUrgentCallCount: 1,
    });

    await store.close();
  });

  it("keeps counting while the destination is disabled and clears once the calls are claimed", async () => {
    const store = await createStore();
    const service = createService(store);
    const job = await seedDelivery(store);

    await enqueuePing(store, job.id, "ou_1");
    await store.destinations.setEnabled("destination-1", false);

    // The claim query only picks up enabled destinations, so the backlog grows
    // instead of draining: that is exactly what the enable confirmation warns
    // about.
    expect(await store.oncall.claimNext({ limit: 10 })).toEqual([]);
    await enqueuePing(store, job.id, "ou_2");

    expect(await service.previewEnableDestination({ id: "destination-1" })).toEqual({
      scheduledUrgentCallCount: 2,
    });

    await store.destinations.setEnabled("destination-1", true);
    expect(await store.oncall.claimNext({ limit: 10 })).toHaveLength(2);

    // Claimed calls are running, not waiting; re-opening the confirmation in
    // another tab must not claim they are still queued.
    expect(await service.previewEnableDestination({ id: "destination-1" })).toEqual({
      scheduledUrgentCallCount: 0,
    });

    await store.close();
  });

  it("rejects an unknown destination instead of reporting an empty backlog", async () => {
    const store = await createStore();
    const service = createService(store);

    await expect(service.previewEnableDestination({ id: "missing" })).rejects.toThrow(
      RecordNotFoundError,
    );

    await store.close();
  });
});

async function enqueuePing(
  store: Awaited<ReturnType<typeof createStore>>,
  deliveryId: string,
  receiver: string,
) {
  return store.oncall.enqueueForDelivery({
    deliveryId,
    destinationId: "destination-1",
    eventId: "event-1",
    fingerprint: "checkout:unavailable",
    receiver,
    channel: "feishu_urgent_phone",
    providerReference,
    trigger: "auto",
    dedupeWindowStartsAt,
    now,
  });
}

/** One firing delivery for destination-1, enough for the ping rows to hang off. */
async function seedDelivery(store: Awaited<ReturnType<typeof createStore>>) {
  await store.sources.create({
    id: "source-1",
    name: "Generic source",
    provider: "generic",
    tokenHash: "token-hash",
  });
  await store.destinations.create({
    id: "destination-1",
    name: "Feishu SRE",
    kind: "feishu",
  });
  const route = await store.routes.create({
    id: "route-1",
    name: "All alerts",
    destinationIds: ["destination-1"],
  });
  const event = await store.intake.recordEvent({
    id: "event-1",
    sourceId: "source-1",
    idempotencyKey: "request-1",
    normalized: {
      title: "Checkout unavailable",
      message: "checkout returned 503",
      severity: "critical",
      status: "firing",
      fingerprint: "checkout:unavailable",
      labels: { service: "checkout" },
      occurredAt: now,
    },
    rawPayload: {},
  });
  const enqueue = await store.deliveries.enqueueForEvent({
    event,
    matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
    dedupeWindowStartsAt,
  });

  return enqueue.created[0]!;
}
