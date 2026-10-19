import { describe, expect, it } from "vite-plus/test";

import { InvalidDeliveryStateError } from "#/infra/sqlite/repositories/delivery/delivery.interface";
import { openSqliteStore } from "#/infra/sqlite/store";

const now = "2026-06-07T00:00:00.000Z";

describe("sqlite store", () => {
  it("reports the SQLite runtime version used by the connection", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:" });

    expect(await store.sqliteVersion()).toMatch(/^3\.\d+\.\d+$/);

    await store.close();
  });

  it("persists instance locale and time zone settings", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });

    expect(await store.settings.get()).toEqual({
      locale: "en-US",
      timeZone: "UTC",
      rawPayloadRetentionDays: 30,
    });

    await store.settings.update({ locale: "zh-Hans", timeZone: "Asia/Shanghai" });

    expect(await store.settings.get()).toEqual({
      locale: "zh-Hans",
      timeZone: "Asia/Shanghai",
      rawPayloadRetentionDays: 30,
    });
    await expect(store.settings.update({ timeZone: "Mars/Olympus" })).rejects.toThrow(
      "valid IANA time zone",
    );

    await store.close();
  });

  it("uses injected id factories for every repository-owned record", async () => {
    let nextId = 0;
    const store = await openSqliteStore({
      databasePath: ":memory:",
      now: () => now,
      ids: {
        source: () => `source-${++nextId}`,
        destination: () => `destination-${++nextId}`,
        route: () => `route-${++nextId}`,
        event: () => `event-${++nextId}`,
        delivery: () => `delivery-${++nextId}`,
        attempt: () => `attempt-${++nextId}`,
      },
    });

    const source = await store.sources.create({
      name: "Grafana",
      provider: "grafana",
      tokenHash: "token-hash",
    });
    const destination = await store.destinations.create({
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    const route = await store.routes.create({
      name: "All alerts",
      destinationIds: [destination.id],
    });
    const event = await store.intake.recordEvent({
      sourceId: source.id,
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
      })
    ).created[0]!;
    const claim = (await store.deliveries.claimNext({ limit: 1 }))[0]!;

    expect({
      sourceId: source.id,
      destinationId: destination.id,
      routeId: route.id,
      eventId: event.id,
      deliveryId: delivery.id,
      attemptId: claim.attempt.id,
    }).toEqual({
      sourceId: "source-1",
      destinationId: "destination-2",
      routeId: "route-3",
      eventId: "event-4",
      deliveryId: "delivery-5",
      attemptId: "attempt-6",
    });

    await store.close();
  });

  it("orders configuration and delivery lists by newest created first", async () => {
    let currentNow = "2026-06-07T00:00:00.000Z";
    let nextEventId = 0;
    let nextDeliveryId = 0;
    const store = await openSqliteStore({
      databasePath: ":memory:",
      now: () => currentNow,
      ids: {
        event: () => `event-${++nextEventId}`,
        delivery: () => `delivery-${++nextDeliveryId}`,
      },
    });

    await store.sources.create({
      id: "source-old",
      name: "A old source",
      provider: "grafana",
      tokenHash: "old-source-token-hash",
      createdAt: "2026-06-07T00:00:00.000Z",
    });
    await store.sources.create({
      id: "source-new",
      name: "Z new source",
      provider: "signoz",
      tokenHash: "new-source-token-hash",
      createdAt: "2026-06-07T00:01:00.000Z",
    });
    await store.destinations.create({
      id: "destination-old",
      name: "A old destination",
      kind: "generic_webhook",
      createdAt: "2026-06-07T00:00:00.000Z",
    });
    await store.destinations.create({
      id: "destination-new",
      name: "Z new destination",
      kind: "generic_webhook",
      createdAt: "2026-06-07T00:01:00.000Z",
    });
    await store.routes.create({
      id: "route-old",
      name: "A old route",
      destinationIds: ["destination-old"],
      createdAt: "2026-06-07T00:00:00.000Z",
    });
    await store.routes.create({
      id: "route-new",
      name: "Z new route",
      destinationIds: ["destination-new"],
      createdAt: "2026-06-07T00:01:00.000Z",
    });

    currentNow = "2026-06-07T00:02:00.000Z";
    const oldEvent = await store.intake.recordEvent({
      sourceId: "source-old",
      idempotencyKey: "request-old",
      normalized: {
        title: "Old alert",
        message: "Old alert message",
        severity: "critical",
        status: "firing",
        fingerprint: "old:alert",
        labels: {},
        occurredAt: currentNow,
      },
      rawPayload: {},
    });
    const oldDelivery = (
      await store.deliveries.enqueueForEvent({
        event: oldEvent,
        matches: [{ routeId: "route-old", destinationIds: ["destination-old"] }],
        dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
      })
    ).created[0]!;

    currentNow = "2026-06-07T00:03:00.000Z";
    const newEvent = await store.intake.recordEvent({
      sourceId: "source-new",
      idempotencyKey: "request-new",
      normalized: {
        title: "New alert",
        message: "New alert message",
        severity: "warning",
        status: "firing",
        fingerprint: "new:alert",
        labels: {},
        occurredAt: currentNow,
      },
      rawPayload: {},
    });
    const newDelivery = (
      await store.deliveries.enqueueForEvent({
        event: newEvent,
        matches: [{ routeId: "route-new", destinationIds: ["destination-new"] }],
        dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
      })
    ).created[0]!;

    expect((await store.sources.list()).map((source) => source.id)).toEqual([
      "source-new",
      "source-old",
    ]);
    expect((await store.sources.listEnabled()).map((source) => source.id)).toEqual([
      "source-new",
      "source-old",
    ]);
    expect((await store.destinations.list()).map((destination) => destination.id)).toEqual([
      "destination-new",
      "destination-old",
    ]);
    expect((await store.destinations.listEnabled()).map((destination) => destination.id)).toEqual([
      "destination-new",
      "destination-old",
    ]);
    expect((await store.routes.list()).map((route) => route.id)).toEqual([
      "route-new",
      "route-old",
    ]);
    expect((await store.routes.listEnabled()).map((route) => route.id)).toEqual([
      "route-new",
      "route-old",
    ]);
    expect((await store.history.listDeliveries()).items.map((delivery) => delivery.id)).toEqual([
      newDelivery.id,
      oldDelivery.id,
    ]);

    await store.close();
  });

  it("records duplicate events while deduping deliveries for the same idempotency key", async () => {
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
    });
    const route = await store.routes.create({
      id: "route-1",
      name: "Critical alerts",
      rule: {
        severities: ["critical"],
      },
      destinationIds: ["destination-1"],
    });
    const eventInput = {
      sourceId: "source-1",
      idempotencyKey: "request-1",
      normalized: {
        title: "CPU high",
        message: "CPU is above threshold",
        severity: "critical" as const,
        status: "firing" as const,
        fingerprint: "cpu:api",
        labels: {
          service: "api",
        },
        occurredAt: now,
      },
      rawPayload: {
        title: "CPU high",
      },
    };

    const firstEvent = await store.intake.recordEvent(eventInput);
    const firstEnqueue = await store.deliveries.enqueueForEvent({
      event: firstEvent,
      matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
      dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
    });
    const duplicateEvent = await store.intake.recordEvent(eventInput);
    const duplicateEnqueue = await store.deliveries.enqueueForEvent({
      event: duplicateEvent,
      matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
      dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
    });

    expect(firstEvent.id).not.toBe(duplicateEvent.id);
    expect(firstEnqueue.created).toHaveLength(1);
    expect(firstEnqueue.deduped).toHaveLength(0);
    expect(duplicateEnqueue.created).toHaveLength(0);
    expect(duplicateEnqueue.deduped).toEqual([
      {
        sourceId: "source-1",
        idempotencyKey: "request-1",
        routeId: "route-1",
        destinationId: "destination-1",
        firstEventId: firstEvent.id,
      },
    ]);

    const events = await store.history.listEvents();

    expect(events.items).toHaveLength(2);
    const duplicateEventItem = events.items.find((item) => item.id === duplicateEvent.id);
    const firstEventItem = events.items.find((item) => item.id === firstEvent.id);

    expect(duplicateEventItem?.deliveryCounts).toEqual({
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      suppressed: 0,
    });
    expect(firstEventItem?.deliveryCounts).toEqual({
      pending: 1,
      running: 0,
      succeeded: 0,
      failed: 0,
      suppressed: 0,
    });

    await store.close();
  });

  it("claims pending deliveries with event, source, destination, route, and attempt context", async () => {
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
      config: {
        url: "https://example.test/webhook",
      },
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

    await store.deliveries.enqueueForEvent({
      event,
      matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
      dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
    });

    const claimed = await store.deliveries.claimNext({ limit: 10 });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.event.id).toBe(event.id);
    expect(claimed[0]?.source.id).toBe("source-1");
    expect(claimed[0]?.destination.config).toEqual({ url: "https://example.test/webhook" });
    expect(claimed[0]?.route?.id).toBe(route.id);
    expect(claimed[0]?.attempt.attemptNumber).toBe(1);
    expect(claimed[0]?.job.state).toBe("running");

    const updated = await store.deliveries.markSucceeded({
      deliveryId: claimed[0]!.job.id,
      attemptId: claimed[0]!.attempt.id,
      responseStatus: 202,
      responseBody: "accepted token=delivery-secret password: hidden",
      renderedPayload: { ok: true },
      providerReference: { type: "feishu_message_id", value: "om_abc123" },
      // The worker reports when the send actually ran; the claim timestamp is
      // only a fallback, so the persisted attempt must move forward.
      startedAt: "2026-06-07T00:00:02.000Z",
      finishedAt: "2026-06-07T00:00:05.000Z",
    });
    const detail = await store.deliveries.get(updated.id);

    expect(updated.state).toBe("succeeded");
    expect(detail?.renderedPayload).toEqual({ ok: true });
    expect(detail?.rawPayloadPruned).toBe(false);
    expect(detail?.providerReference).toEqual({ type: "feishu_message_id", value: "om_abc123" });
    expect(detail?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "succeeded",
        responseStatus: 202,
        responseBody: "accepted token=[REDACTED] password: [REDACTED]",
        startedAt: "2026-06-07T00:00:02.000Z",
        finishedAt: "2026-06-07T00:00:05.000Z",
      },
    ]);

    // Pruning the event must not change what the operator sees for the
    // rendered side of the payload comparison.
    await store.intake.pruneAllRawPayloads({ before: "2026-06-08T00:00:00.000Z" });
    const prunedDetail = await store.deliveries.get(updated.id);

    expect(prunedDetail?.event.rawPayload).toEqual({ retentionPruned: true });
    expect(prunedDetail?.rawPayloadPruned).toBe(true);
    expect(prunedDetail?.renderedPayload).toEqual({ ok: true });

    await store.close();
  });

  it("pauses pending delivery claims while the destination or route is disabled", async () => {
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
      config: {
        url: "https://example.test/webhook",
      },
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

    await store.deliveries.enqueueForEvent({
      event,
      matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
      dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
    });

    await store.destinations.setEnabled("destination-1", false);
    expect(await store.deliveries.claimNext({ limit: 1 })).toHaveLength(0);

    await store.destinations.setEnabled("destination-1", true);
    await store.routes.setEnabled("route-1", false);
    expect(await store.deliveries.claimNext({ limit: 1 })).toHaveLength(0);

    await store.routes.setEnabled("route-1", true);
    expect(await store.deliveries.claimNext({ limit: 1 })).toHaveLength(1);

    await store.close();
  });

  it("cascades dependent delivery records when configuration rows are deleted", async () => {
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
    });
    const route = await store.routes.create({
      id: "route-1",
      name: "All alerts",
      destinationIds: ["destination-1"],
    });
    const firstEvent = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: "request-1",
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
    const firstDelivery = (
      await store.deliveries.enqueueForEvent({
        event: firstEvent,
        matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
        dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
      })
    ).created[0]!;

    await store.deliveries.claimNext({ limit: 1 });
    await store.routes.delete(route.id);

    expect(await store.intake.get(firstEvent.id)).not.toBeNull();
    expect(await store.deliveries.get(firstDelivery.id)).toBeNull();

    await store.destinations.create({
      id: "destination-2",
      name: "Audit webhook",
      kind: "generic_webhook",
    });
    const secondRoute = await store.routes.create({
      id: "route-2",
      name: "Audit alerts",
      destinationIds: ["destination-2"],
    });
    const secondEvent = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: "request-2",
      normalized: {
        title: "Memory high",
        message: "Memory is above threshold",
        severity: "warning",
        status: "firing",
        fingerprint: "memory:api",
        labels: {},
        occurredAt: now,
      },
      rawPayload: {},
    });
    const secondDelivery = (
      await store.deliveries.enqueueForEvent({
        event: secondEvent,
        matches: [{ routeId: secondRoute.id, destinationIds: secondRoute.destinationIds }],
        dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
      })
    ).created[0]!;

    await store.destinations.delete("destination-2");

    expect(await store.intake.get(secondEvent.id)).not.toBeNull();
    expect(await store.deliveries.get(secondDelivery.id)).toBeNull();
    expect(await store.routes.get(secondRoute.id)).not.toBeNull();

    await store.sources.delete("source-1");

    expect(await store.sources.get("source-1")).toBeNull();
    expect(await store.intake.get(firstEvent.id)).toBeNull();
    expect(await store.intake.get(secondEvent.id)).toBeNull();
    expect((await store.history.listEvents()).items).toEqual([]);

    await store.close();
  });

  it("manual retry only accepts failed deliveries and schedules an exhausted job for one more attempt", async () => {
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
      config: {
        url: "https://example.test/webhook",
      },
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

    await expect(store.deliveries.retryNow({ deliveryId: delivery.id })).rejects.toThrow(
      InvalidDeliveryStateError,
    );

    const claimed = await store.deliveries.claimNext({ limit: 1 });
    await store.deliveries.markFailed({
      deliveryId: claimed[0]!.job.id,
      attemptId: claimed[0]!.attempt.id,
      error: "destination unavailable",
      retryAt: null,
      responseStatus: 503,
      responseBody: "unavailable",
      finishedAt: "2026-06-07T00:01:00.000Z",
    });

    const retried = await store.deliveries.retryNow({
      deliveryId: delivery.id,
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

    await store.destinations.setEnabled("destination-1", false);
    expect(
      await store.deliveries.claimNext({
        now: "2026-06-07T00:02:00.000Z",
        limit: 1,
      }),
    ).toHaveLength(0);

    await store.destinations.setEnabled("destination-1", true);

    const retryClaim = await store.deliveries.claimNext({
      now: "2026-06-07T00:02:00.000Z",
      limit: 1,
    });

    expect(retryClaim).toHaveLength(1);
    expect(retryClaim[0]?.attempt.attemptNumber).toBe(2);

    await store.close();
  });

  it("filters operational history and exposes event and delivery details", async () => {
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
    await store.sources.create({
      id: "source-2",
      name: "Uptime Kuma",
      provider: "uptime_kuma",
      tokenHash: "token-hash-2",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
      config: {
        url: "https://example.test/webhook",
        headers: {
          Authorization: "Bearer destination-secret",
          "X-Team": "sre",
        },
      },
    });
    await store.destinations.create({
      id: "destination-2",
      name: "Audit email",
      kind: "email",
      config: {
        endpointUrl: "https://mail.example.test/send",
        to: ["audit@example.test"],
        from: "tocsin@example.test",
      },
    });
    const criticalRoute = await store.routes.create({
      id: "route-1",
      name: "Critical route",
      rule: {
        severities: ["critical"],
      },
      destinationIds: ["destination-1"],
    });
    const uptimeRoute = await store.routes.create({
      id: "route-2",
      name: "Uptime audit",
      rule: {
        sourceIds: ["source-2"],
      },
      destinationIds: ["destination-2"],
    });

    const criticalEvent = await store.intake.recordEvent({
      sourceId: "source-1",
      idempotencyKey: "request-1",
      normalized: {
        title: "CPU high",
        message: "CPU is above threshold",
        severity: "critical",
        status: "firing",
        fingerprint: "cpu:api",
        labels: { service: "api" },
        occurredAt: now,
      },
      rawPayload: {
        title: "CPU high",
      },
      rawHeaders: {
        "x-provider": "grafana",
      },
    });
    const uptimeEvent = await store.intake.recordEvent({
      sourceId: "source-2",
      idempotencyKey: "request-2",
      normalized: {
        title: "API recovered",
        message: "Health check resolved",
        severity: "info",
        status: "resolved",
        fingerprint: "uptime:api",
        labels: { service: "api" },
        occurredAt: now,
      },
      rawPayload: {
        msg: "up",
      },
    });

    const criticalDelivery = (
      await store.deliveries.enqueueForEvent({
        event: criticalEvent,
        matches: [{ routeId: criticalRoute.id, destinationIds: criticalRoute.destinationIds }],
        dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
      })
    ).created[0]!;
    await store.deliveries.enqueueForEvent({
      event: uptimeEvent,
      matches: [{ routeId: uptimeRoute.id, destinationIds: uptimeRoute.destinationIds }],
      dedupeWindowStartsAt: "2026-06-06T23:55:00.000Z",
    });

    const claimed = await store.deliveries.claimNext({ limit: 1 });
    await store.deliveries.markFailed({
      deliveryId: claimed[0]!.job.id,
      attemptId: claimed[0]!.attempt.id,
      error: "destination unavailable token=delivery-secret",
      retryAt: null,
      responseStatus: 503,
      responseBody: "unavailable password: hidden",
    });

    expect((await store.history.listEvents({ severity: "critical" })).items).toHaveLength(1);
    expect((await store.history.listEvents({ status: "resolved" })).items[0]?.id).toBe(
      uptimeEvent.id,
    );
    expect((await store.history.listEvents({ q: "CPU" })).items[0]?.id).toBe(criticalEvent.id);
    expect((await store.history.listDeliveries({ severity: "critical" })).items[0]?.id).toBe(
      criticalDelivery.id,
    );
    expect((await store.history.listDeliveries({ status: "resolved" })).items).toHaveLength(1);
    expect((await store.history.listDeliveries({ q: "CPU" })).items[0]?.id).toBe(
      criticalDelivery.id,
    );
    expect(
      (await store.history.listDeliveries({ destinationId: "destination-1" })).items[0]?.id,
    ).toBe(criticalDelivery.id);
    // The route filter narrows the same list the destination filter does, and
    // its `total` follows the page like every other predicate.
    const routedDeliveries = await store.history.listDeliveries({ routeId: "route-1" });
    expect(routedDeliveries.items.map((delivery) => delivery.id)).toEqual([criticalDelivery.id]);
    expect(routedDeliveries.total).toBe(1);
    const unmatchedRoute = await store.history.listDeliveries({ routeId: "route-missing" });
    expect(unmatchedRoute.items).toHaveLength(0);
    expect(unmatchedRoute.total).toBe(0);
    expect((await store.history.listDeliveries({ state: "failed" })).items[0]?.lastError).toBe(
      "destination unavailable token=[REDACTED]",
    );
    const eventFirstPage = await store.history.listEvents({ limit: 1, page: 1 });
    const eventSecondPage = await store.history.listEvents({
      limit: 1,
      page: 2,
    });
    const deliveryFirstPage = await store.history.listDeliveries({ limit: 1, page: 1 });
    const deliverySecondPage = await store.history.listDeliveries({ limit: 1, page: 2 });

    expect(eventFirstPage).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 1,
    });
    expect(eventSecondPage.items.map((event) => event.id)).toEqual([criticalEvent.id]);
    expect(eventSecondPage).toMatchObject({
      total: 2,
      page: 2,
      pageSize: 1,
    });
    // Deliveries paginate by page number like every other list, so the shape
    // mirrors the event assertions above rather than a cursor.
    expect(deliveryFirstPage).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 1,
    });
    expect(deliverySecondPage.items).toHaveLength(1);
    expect(deliverySecondPage.items[0]?.id).not.toBe(deliveryFirstPage.items[0]?.id);
    expect(deliverySecondPage).toMatchObject({
      total: 2,
      page: 2,
      pageSize: 1,
    });

    const eventDetail = await store.history.getEventDetail(criticalEvent.id);
    const deliveryDetail = await store.deliveries.get(criticalDelivery.id);

    expect(eventDetail?.event.rawPayload).toEqual({ title: "CPU high" });
    expect(eventDetail?.event.rawHeaders).toEqual({ "x-provider": "grafana" });
    expect(eventDetail?.deliveries).toMatchObject([
      {
        id: criticalDelivery.id,
        destinationId: "destination-1",
        destinationName: "Ops webhook",
        routeId: "route-1",
        routeName: "Critical route",
        state: "failed",
        attemptCount: 1,
        maxAttempts: 3,
        nextAttemptAt: null,
        lastError: "destination unavailable token=[REDACTED]",
      },
    ]);
    expect(JSON.stringify(eventDetail?.deliveries)).not.toContain("https://example.test/webhook");
    expect(JSON.stringify(eventDetail?.deliveries)).not.toContain("Bearer destination-secret");
    expect(eventDetail?.routeMatches).toMatchObject([
      {
        routeId: "route-2",
        routeName: "Uptime audit",
        matched: false,
        destinationIds: ["destination-2"],
      },
      {
        routeId: "route-1",
        routeName: "Critical route",
        matched: true,
        destinationIds: ["destination-1"],
      },
    ]);
    expect(
      eventDetail?.routeMatches
        .find((match) => match.routeId === "route-2")
        ?.checks.some((check) => check.field === "source" && !check.matched),
    ).toBe(true);
    expect(deliveryDetail?.destination).toMatchObject({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    expect(deliveryDetail?.destination).not.toHaveProperty("config");
    expect(deliveryDetail?.destinationMetadata).toEqual({
      endpoint: "https://example.test/webhook",
      host: "example.test",
      method: "POST",
      templateConfigured: false,
      headerNames: ["Authorization", "X-Team"],
    });
    // Header values stay out of delivery metadata (names only).
    expect(JSON.stringify(deliveryDetail?.destinationMetadata)).not.toContain("Bearer");
    expect(JSON.stringify(deliveryDetail)).not.toContain("Bearer destination-secret");
    expect(deliveryDetail?.renderedPayload).toBeNull();
    expect(deliveryDetail?.providerReference).toBeNull();
    expect(deliveryDetail?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "failed",
        responseStatus: 503,
        responseBody: "unavailable password: [REDACTED]",
        error: "destination unavailable token=[REDACTED]",
      },
    ]);

    await store.close();
  });
});
