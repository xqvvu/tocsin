import { describe, expect, it, vi } from "vite-plus/test";

import type { AlertSeverity, AlertStatus, JsonObject, ProviderReference } from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { ClaimedDelivery } from "#/infra/sqlite/repositories/delivery/delivery.interface";
import { openSqliteStore } from "#/infra/sqlite/store";
import { OncallService } from "#/server/oncall/oncall.service";
import { DomainValidationError } from "#/server/runtime/domain-errors";

const now = "2026-10-09T08:00:00.000Z";
const messageReference: ProviderReference = { type: "feishu_message_id", value: "om_123" };

describe("oncall auto paging trigger", () => {
  it("enqueues one ping per receiver for a firing app-mode delivery", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const { delivery } = await seedDelivery(store);
    const service = new OncallService({ store });

    await service.triggerPingsForDelivery({
      delivery,
      providerReference: messageReference,
      now,
    });

    const pings = await store.oncall.listForDelivery(delivery.job.id);

    expect(pings).toHaveLength(2);
    expect(pings.map((ping) => ping.receiver)).toEqual(["ou_1", "ou_2"]);
    expect(pings[0]).toMatchObject({
      deliveryId: delivery.job.id,
      destinationId: "destination-1",
      eventId: delivery.event.id,
      channel: "feishu_urgent_phone",
      state: "scheduled",
      trigger: "auto",
      initiatedBy: null,
      providerReference: messageReference,
      attemptCount: 0,
      maxAttempts: 3,
      nextAttemptAt: null,
      lastError: null,
      firedAt: null,
    });
  });

  it("suppresses repeat pages within the dedupe window for the same fingerprint, destination, and receiver", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const { delivery } = await seedDelivery(store);
    const service = new OncallService({ store });

    await service.triggerPingsForDelivery({ delivery, providerReference: messageReference, now });
    await service.triggerPingsForDelivery({ delivery, providerReference: messageReference, now });

    expect(await store.oncall.listForDelivery(delivery.job.id)).toHaveLength(2);

    // Outside the window the same page is placed again.
    const later = "2026-10-09T08:06:00.000Z";

    await service.triggerPingsForDelivery({
      delivery,
      providerReference: messageReference,
      now: later,
    });

    expect(await store.oncall.listForDelivery(delivery.job.id)).toHaveLength(4);
  });

  it("exposes the paging records on the delivery detail", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const { delivery } = await seedDelivery(store);
    const service = new OncallService({ store });

    await service.triggerPingsForDelivery({ delivery, providerReference: messageReference, now });

    const detail = await store.deliveries.get(delivery.job.id);

    expect(detail?.pings.map((ping) => ping.receiver)).toEqual(["ou_1", "ou_2"]);
    expect(detail?.pings[0]?.state).toBe("scheduled");
  });

  it("does not page again when the alert card itself is re-delivered inside the window", async () => {
    // The "card retry must not duplicate pings" contract: a retried delivery
    // posts a *new* message and triggers the paging hook again with a different
    // provider reference, and the receiver must still be called only once.
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const { delivery } = await seedDelivery(store);
    const service = new OncallService({ store });

    await service.triggerPingsForDelivery({
      delivery,
      providerReference: messageReference,
      now,
    });

    const retryAt = "2026-10-09T08:01:00.000Z";
    await service.triggerPingsForDelivery({
      delivery,
      providerReference: { type: "feishu_message_id", value: "om_retry" },
      now: retryAt,
    });

    const pings = await store.oncall.listForDelivery(delivery.job.id);

    expect(pings).toHaveLength(2);
    expect(pings.map((ping) => ping.providerReference?.value)).toEqual(["om_123", "om_123"]);
  });

  it("enqueues nothing for webhook mode, non-firing alerts, severity misses, disabled auto paging, and other kinds", async () => {
    const cases: Array<{
      name: string;
      config?: JsonObject;
      severity?: AlertSeverity;
      status?: AlertStatus;
    }> = [
      {
        name: "webhook mode",
        config: {
          sendMode: "webhook",
          webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/x",
        },
      },
      { name: "resolved alert", status: "resolved" },
      { name: "warning below the critical gate", severity: "warning" },
      { name: "auto paging disabled", config: appModeConfig({ autoEnabled: false }) },
      {
        name: "empty severity list must not widen paging to warning",
        severity: "warning",
        config: appModeConfig({ severities: [] }),
      },
      {
        name: "empty severity list must not widen paging to info",
        severity: "info",
        config: appModeConfig({ severities: [] }),
      },
    ];

    for (const testCase of cases) {
      const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
      const { delivery } = await seedDelivery(store, {
        config: testCase.config,
        severity: testCase.severity,
        status: testCase.status,
      });
      const service = new OncallService({ store });

      await service.triggerPingsForDelivery({
        delivery,
        providerReference: messageReference,
        now,
      });

      expect(
        await store.oncall.listForDelivery(delivery.job.id),
        `expected no pages for: ${testCase.name}`,
      ).toEqual([]);
    }
  });

  it("pages critical alerts for a stored empty severity list", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const { delivery } = await seedDelivery(store, {
      config: appModeConfig({ severities: [] }),
      severity: "critical",
    });
    const service = new OncallService({ store });

    await service.triggerPingsForDelivery({
      delivery,
      providerReference: messageReference,
      now,
    });

    expect(await store.oncall.listForDelivery(delivery.job.id)).toHaveLength(2);
  });
});

describe("oncall manual paging", () => {
  it("queues one manual ping per receiver, records the operator, and dispatches immediately", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const deliveryId = await seedSucceededDelivery(store);
    const dispatchNow = vi.fn<(now: string) => Promise<unknown>>(async () => {});
    const service = new OncallService({ store, now: () => now, dispatchNow });

    const pings = await service.buzzDelivery({ deliveryId, initiatedBy: "user-1" });

    expect(pings.map((ping) => ping.receiver)).toEqual(["ou_1", "ou_2"]);
    expect(pings[0]).toMatchObject({
      deliveryId,
      destinationId: "destination-1",
      channel: "feishu_urgent_phone",
      state: "scheduled",
      trigger: "manual",
      initiatedBy: "user-1",
      providerReference: messageReference,
      attemptCount: 0,
      firedAt: null,
    });
    expect(dispatchNow).toHaveBeenCalledExactlyOnceWith(now);
    expect((await store.deliveries.get(deliveryId))?.pings).toHaveLength(2);
  });

  it("refuses to page a delivery that has no Feishu message reference", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const { delivery } = await seedDelivery(store);
    const service = new OncallService({ store, now: () => now });

    await expect(service.buzzDelivery({ deliveryId: delivery.job.id })).rejects.toThrow(
      DomainValidationError,
    );
    await expect(service.buzzDelivery({ deliveryId: delivery.job.id })).rejects.toThrow(
      /no Feishu message reference/,
    );
    expect(await store.oncall.listForDelivery(delivery.job.id)).toEqual([]);
  });

  it("refuses to page a destination without urgent receivers", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const deliveryId = await seedSucceededDelivery(store, {
      config: { sendMode: "app", app: { appRef: "feishu-app-1", chatId: "oc_group" } },
    });
    const service = new OncallService({ store, now: () => now });

    await expect(service.buzzDelivery({ deliveryId })).rejects.toThrow(
      /Configure urgent receivers/,
    );
    expect(await store.oncall.listForDelivery(deliveryId)).toEqual([]);
  });

  it("refuses a missing delivery", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const service = new OncallService({ store, now: () => now });

    await expect(service.buzzDelivery({ deliveryId: "delivery-missing" })).rejects.toThrow(
      RecordNotFoundError,
    );
  });

  it("refuses to page the same receivers again inside the dedupe window", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const deliveryId = await seedSucceededDelivery(store);
    const service = new OncallService({ store, now: () => now });

    await service.buzzDelivery({ deliveryId, initiatedBy: "user-1" });

    await expect(service.buzzDelivery({ deliveryId, initiatedBy: "user-2" })).rejects.toThrow(
      /already paged for this alert/,
    );
    expect(await store.oncall.listForDelivery(deliveryId)).toHaveLength(2);
  });

  it("keeps the records queued when the immediate dispatch fails", async () => {
    const store = await openSqliteStore({ databasePath: ":memory:", now: () => now });
    const deliveryId = await seedSucceededDelivery(store);
    const dispatchNow = vi.fn<(now: string) => Promise<unknown>>(async () => {
      throw new Error("worker runner unavailable");
    });
    const service = new OncallService({ store, now: () => now, dispatchNow });

    const pings = await service.buzzDelivery({ deliveryId, initiatedBy: "user-1" });

    expect(pings).toHaveLength(2);
    expect(pings.every((ping) => ping.state === "scheduled")).toBe(true);
    expect(await store.oncall.listForDelivery(deliveryId)).toHaveLength(2);
  });
});

function appModeConfig(
  urgent: { autoEnabled?: boolean; severities?: string[]; receivers?: string[] } = {},
): JsonObject {
  return {
    sendMode: "app",
    app: { appRef: "feishu-app-1", chatId: "oc_group" },
    urgent: {
      autoEnabled: true,
      severities: ["critical"],
      userIdType: "open_id",
      receivers: ["ou_1", "ou_2"],
      ...urgent,
    },
  };
}

/** Seeds a delivery that already succeeded through the app and captured a message id. */
async function seedSucceededDelivery(
  store: Awaited<ReturnType<typeof openSqliteStore>>,
  options: { config?: JsonObject } = {},
): Promise<string> {
  await seedDelivery(store, options);

  const [claimed] = await store.deliveries.claimNext({ now, limit: 1 });
  const deliveryId = claimed!.job.id;

  await store.deliveries.markSucceeded({
    deliveryId,
    attemptId: claimed!.attempt.id,
    providerReference: messageReference,
    finishedAt: now,
  });

  return deliveryId;
}

async function seedDelivery(
  store: Awaited<ReturnType<typeof openSqliteStore>>,
  options: { config?: JsonObject; severity?: AlertSeverity; status?: AlertStatus } = {},
): Promise<{ delivery: ClaimedDelivery }> {
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
    config: options.config ?? appModeConfig(),
  });
  const route = await store.routes.create({
    id: "route-1",
    name: "All alerts",
    destinationIds: ["destination-1"],
  });
  const event = await store.intake.recordEvent({
    sourceId: "source-1",
    idempotencyKey: "request-1",
    normalized: {
      title: "Checkout unavailable",
      message: "checkout returned 503",
      severity: options.severity ?? "critical",
      status: options.status ?? "firing",
      fingerprint: "checkout:unavailable",
      labels: { service: "checkout" },
      occurredAt: now,
    },
    rawPayload: {},
  });
  const enqueue = await store.deliveries.enqueueForEvent({
    event,
    matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
    dedupeWindowStartsAt: "2026-10-09T07:55:00.000Z",
  });
  const job = enqueue.created[0]!;
  const storedEvent = await store.intake.get(job.eventId);
  const source = await store.sources.get("source-1");
  const destination = await store.destinations.get("destination-1");

  return {
    delivery: {
      job,
      attempt: {
        id: "attempt-1",
        deliveryId: job.id,
        attemptNumber: 1,
        state: "running",
        responseStatus: null,
        responseBody: null,
        error: null,
        startedAt: now,
        finishedAt: null,
      },
      event: storedEvent!,
      source: source!,
      destination: destination!,
      route: await store.routes.get("route-1"),
    },
  };
}
