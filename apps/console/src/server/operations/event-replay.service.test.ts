import { describe, expect, it } from "vite-plus/test";

import { openSqliteStore } from "#/infra/sqlite/store";
import { EventReplayService } from "#/server/operations/event-replay.service";

const now = "2026-06-09T08:00:00.000Z";

async function createStore() {
  let nextId = 0;

  return openSqliteStore({
    databasePath: ":memory:",
    now: () => now,
    ids: {
      event: () => `event-${++nextId}`,
      delivery: () => `delivery-${++nextId}`,
      attempt: () => `attempt-${++nextId}`,
    },
  });
}

describe("event replay service", () => {
  it("creates missing deliveries for an old unmatched event without duplicating them", async () => {
    const store = await createStore();
    const service = new EventReplayService({ store, now: () => now });

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
      rule: {
        severities: ["critical"],
        labels: [{ key: "service", operator: "equals", value: "checkout" }],
      },
      destinationIds: ["destination-1"],
    });

    await expect(service.previewEventReplay({ eventId: event.id })).resolves.toMatchObject({
      eventId: event.id,
      matchedRouteCount: 1,
      newDeliveryCount: 1,
      existingDeliveryCount: 0,
      targets: [
        {
          routeId: "route-1",
          routeName: "Critical checkout",
          destinationId: "destination-1",
          deliveryId: null,
          alreadyExists: false,
        },
      ],
    });

    const firstReplay = await service.replayEvent({ eventId: event.id });

    expect(firstReplay?.createdDeliveryIds).toEqual(["delivery-2"]);
    expect(firstReplay?.skippedExistingCount).toBe(0);
    expect(firstReplay?.newDeliveryCount).toBe(1);

    const secondReplay = await service.replayEvent({ eventId: event.id });

    expect(secondReplay?.createdDeliveryIds).toEqual([]);
    expect(secondReplay?.skippedExistingCount).toBe(1);
    expect(secondReplay?.newDeliveryCount).toBe(0);
    expect(secondReplay?.existingDeliveryCount).toBe(1);

    await expect(service.previewEventReplay({ eventId: event.id })).resolves.toMatchObject({
      newDeliveryCount: 0,
      existingDeliveryCount: 1,
      targets: [
        {
          routeId: "route-1",
          destinationId: "destination-1",
          deliveryId: "delivery-2",
          alreadyExists: true,
        },
      ],
    });

    await store.close();
  });

  it("previews and replays recent events for a route without automatic delivery creation", async () => {
    const store = await createStore();
    const service = new EventReplayService({ store, now: () => now });

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
    const matchingEvent = await store.intake.recordEvent({
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
    const missedEvent = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: "request-2",
      normalized: {
        title: "Billing warning",
        message: "billing latency high",
        severity: "warning",
        status: "firing",
        fingerprint: "billing:latency",
        labels: { service: "billing" },
        occurredAt: now,
      },
      rawPayload: {},
      routeMatches: [],
    });

    await store.routes.create({
      id: "route-1",
      name: "Critical checkout",
      rule: {
        severities: ["critical"],
        labels: [{ key: "service", operator: "equals", value: "checkout" }],
      },
      destinationIds: ["destination-1"],
    });

    await expect(
      service.previewRouteReplay({ routeId: "route-1", limit: 20 }),
    ).resolves.toMatchObject({
      routeId: "route-1",
      routeName: "Critical checkout",
      enabled: true,
      scannedEventCount: 2,
      matchedEventCount: 1,
      newDeliveryCount: 1,
      candidates: [
        {
          event: {
            id: matchingEvent.id,
            sourceName: "Generic source",
            title: "Checkout unavailable",
          },
          newDeliveryCount: 1,
        },
      ],
    });

    const replay = await service.replayRouteEvents({
      routeId: "route-1",
      eventIds: [matchingEvent.id, missedEvent.id],
    });

    expect(replay?.createdDeliveryIds).toEqual(["delivery-3"]);
    expect(replay?.eventCount).toBe(1);

    await expect(
      service.previewRouteReplay({ routeId: "route-1", limit: 20 }),
    ).resolves.toMatchObject({
      matchedEventCount: 1,
      newDeliveryCount: 0,
      candidates: [],
    });

    await store.close();
  });

  it("redacts preview DTOs without changing replay matching", async () => {
    const store = await createStore();
    const service = new EventReplayService({ store, now: () => now });

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
      idempotencyKey: null,
      normalized: {
        title: "Checkout failed Authorization: Bearer abcdefgh1234",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout:unavailable",
        labels: { authorization: "Bearer abcdefgh1234" },
        occurredAt: now,
      },
      rawPayload: {},
      routeMatches: [],
    });

    await store.routes.create({
      id: "route-1",
      name: "Credential match",
      rule: {
        labels: [{ key: "authorization", operator: "equals", value: "Bearer abcdefgh1234" }],
      },
      destinationIds: ["destination-1"],
    });

    const preview = await service.previewEventReplay({ eventId: event.id });
    const labelCheck = preview?.routeMatches[0].checks.find((check) => check.field === "label");

    // Matching still uses the raw label value, so the route is selected...
    expect(preview?.matchedRouteCount).toBe(1);
    // ...but the evidence returned to the console does not repeat it.
    expect(labelCheck?.actual).toBe("[REDACTED]");
    // The rule's own `expected` value is operator-authored configuration and
    // stays readable, so only the event-side evidence is asserted above.

    const replay = await service.replayEvent({ eventId: event.id });

    expect(replay?.createdDeliveryIds).toHaveLength(1);

    await store.close();
  });
});
