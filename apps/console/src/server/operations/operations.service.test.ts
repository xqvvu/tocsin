import { describe, expect, it } from "vite-plus/test";

import type { OncallPing } from "@tocsin/core";

import { openSqliteStore } from "#/infra/sqlite/store";
import { OncallService } from "#/server/oncall/oncall.service";
import { OperationsService } from "#/server/operations/operations.service";

const now = "2026-06-09T08:00:00.000Z";

async function createStore() {
  return openSqliteStore({
    databasePath: ":memory:",
    now: () => now,
    ids: {
      source: () => "source-1",
      destination: () => "destination-1",
      route: () => "route-1",
      event: () => "event-1",
      delivery: () => "delivery-1",
      attempt: () => "attempt-1",
    },
  });
}

describe("operations service", () => {
  it("combines history projections and delegates delivery retry", async () => {
    const store = await createStore();
    const service = new OperationsService({ store, oncall: new OncallService({ store }) });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: "token-hash",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    const event = await store.intake.recordEvent({
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
      routeMatches: [],
    });

    await store.routes.create({
      id: "route-1",
      name: "Critical checkout",
      rule: { severities: ["critical"] },
      destinationIds: ["destination-1"],
    });

    const delivery = (
      await store.deliveries.enqueueForEvent({
        event,
        matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
        dedupeWindowStartsAt: now,
        now,
      })
    ).created[0]!;
    const claimed = (await store.deliveries.claimNext({ now, limit: 1 }))[0]!;
    await store.deliveries.markFailed({
      deliveryId: delivery.id,
      attemptId: claimed.attempt.id,
      error: "upstream unavailable",
      retryAt: null,
      finishedAt: now,
    });

    await expect(service.listOperations({ limit: 10 })).resolves.toMatchObject({
      events: { items: [{ id: event.id }] },
      deliveries: { items: [{ id: delivery.id }] },
    });

    // A route filter narrows deliveries only. Events have no route dimension,
    // so the events list keeps returning the same rows.
    const byRoute = await service.listOperations({ limit: 10, routeId: "route-1" });
    expect(byRoute.deliveries.items.map((item) => item.id)).toEqual([delivery.id]);
    expect(byRoute.deliveries.total).toBe(1);
    expect(byRoute.events.items.map((item) => item.id)).toEqual([event.id]);
    expect(byRoute.events.total).toBe(1);
    const unmatchedRoute = await service.listOperations({ limit: 10, routeId: "route-missing" });
    expect(unmatchedRoute.deliveries.total).toBe(0);
    expect(unmatchedRoute.events.total).toBe(1);

    // Destination kind narrows deliveries only, like the other delivery-only
    // filters, and it agrees with the row it keeps.
    const byKind = await service.listOperations({
      limit: 10,
      destinationKind: "generic_webhook",
    });
    expect(byKind.deliveries.items.map((item) => item.id)).toEqual([delivery.id]);
    expect(byKind.deliveries.total).toBe(1);
    expect(byKind.events.total).toBe(1);
    const otherKind = await service.listOperations({ limit: 10, destinationKind: "email" });
    expect(otherKind.deliveries.total).toBe(0);
    expect(otherKind.events.total).toBe(1);

    await expect(service.getEventDetail(event.id)).resolves.toMatchObject({
      event: { id: event.id },
    });
    await expect(service.getDeliveryDetail(delivery.id)).resolves.toMatchObject({
      job: { id: delivery.id },
    });

    await expect(service.retryDelivery(delivery.id)).resolves.toMatchObject({
      id: delivery.id,
      state: "pending",
    });

    await store.close();
  });

  it("delegates manual paging with the operator and scopes the result to the delivery", async () => {
    const store = await createStore();
    const calls: Array<{ deliveryId: string; initiatedBy?: string | null }> = [];
    const service = new OperationsService({
      store,
      oncall: {
        async buzzDelivery(input) {
          calls.push(input);

          return [oncallPing()];
        },
      },
    });

    await expect(service.buzzDelivery("delivery-1", "user-1")).resolves.toEqual({
      deliveryId: "delivery-1",
      pings: [oncallPing()],
    });
    expect(calls).toEqual([{ deliveryId: "delivery-1", initiatedBy: "user-1" }]);
    await store.close();
  });
});

describe("operations service time range", () => {
  it("resolves the relative window against the injected clock for both lists", async () => {
    let nextId = 0;
    const store = await openSqliteStore({
      databasePath: ":memory:",
      now: () => "2026-10-12T10:00:00.000Z",
      ids: {
        source: () => "source-1",
        destination: () => "destination-1",
        route: () => "route-1",
        event: () => `event-${++nextId}`,
        delivery: () => `delivery-${++nextId}`,
        attempt: () => `attempt-${++nextId}`,
      },
    });
    const service = new OperationsService({
      store,
      oncall: new OncallService({ store }),
      // Pinned so the boundary is a fact of the test, not of the wall clock.
      now: () => new Date("2026-10-12T10:00:00.000Z"),
    });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: "token-hash",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "Critical",
      rule: { severities: ["critical"] },
      destinationIds: ["destination-1"],
    });

    const eventAt = (title: string, receivedAt: string) =>
      store.intake.recordEvent({
        sourceId: "source-1",
        idempotencyKey: title,
        receivedAt,
        normalized: {
          title,
          message: title,
          severity: "critical",
          status: "firing",
          fingerprint: `fp-${title}`,
          labels: {},
          occurredAt: receivedAt,
        },
        rawPayload: {},
      });

    const oldEvent = await eventAt("old", "2026-10-12T09:00:00.000Z");
    const recentEvent = await eventAt("recent", "2026-10-12T09:50:00.000Z");

    for (const [event, at] of [
      [oldEvent, "2026-10-12T09:00:00.000Z"],
      [recentEvent, "2026-10-12T09:50:00.000Z"],
    ] as const) {
      await store.deliveries.enqueueForEvent({
        event,
        matches: [{ routeId: "route-1", destinationIds: ["destination-1"] }],
        dedupeWindowStartsAt: at,
        now: at,
      });
    }

    const all = await service.listOperations({ limit: 10 });
    expect(all.events.total).toBe(2);
    expect(all.deliveries.total).toBe(2);

    // 15 minutes before the pinned clock is 09:45, so the 09:00 pair drops out
    // of both lists while the 09:50 pair stays.
    const recent = await service.listOperations({ limit: 10, range: "15m" });
    expect(recent.events.items.map((event) => event.id)).toEqual([recentEvent.id]);
    expect(recent.events.total).toBe(1);
    expect(recent.deliveries.items.map((delivery) => delivery.eventId)).toEqual([recentEvent.id]);
    expect(recent.deliveries.total).toBe(1);

    await store.close();
  });
});

function oncallPing(): OncallPing {
  return {
    id: "ping-1",
    deliveryId: "delivery-1",
    destinationId: "destination-1",
    eventId: "event-1",
    receiver: "ou_1",
    channel: "feishu_urgent_phone",
    state: "scheduled",
    trigger: "manual",
    initiatedBy: "user-1",
    providerReference: { type: "feishu_message_id", value: "om_123" },
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    firedAt: null,
  };
}
