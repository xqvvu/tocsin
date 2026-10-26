import { describe, expect, it } from "vite-plus/test";

import type { ProviderReference } from "@tocsin/core";
import type { JsonObject } from "@tocsin/core";
import type { UrgencyRegistry } from "@tocsin/destinations";

import { openSqliteStore } from "#/infra/sqlite/store";
import type { DestinationConfigResolver } from "#/server/integrations/destination-config-resolver";
import { OncallWorker } from "#/server/oncall/oncall-worker.service";

const now = "2026-10-09T08:00:00.000Z";
const messageReference: ProviderReference = { type: "feishu_message_id", value: "om_123" };

describe("oncall worker", () => {
  it("fires a pending ping and never touches the delivery", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    const calls: Array<{ kind: string; input: unknown }> = [];
    const urgency = {
      async ping(kind, input) {
        calls.push({ kind, input });

        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const worker = new OncallWorker({
      store,
      urgency,
      now: () => now,
      resolveDestinationConfig: resolveAppCredentials,
    });

    const result = await worker.runOnce();

    expect(result).toMatchObject({ claimed: 1, succeeded: 1, failed: 0, retrying: 0 });

    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({ state: "fired", attemptCount: 1, firedAt: now, lastError: null });
    expect(calls).toEqual([
      {
        kind: "feishu_urgent_phone",
        input: {
          app: { appId: "cli_sre", appSecret: "secret-1" },
          messageId: "om_123",
          receivers: ["ou_1"],
          userIdType: "open_id",
        },
      },
    ]);
    expect((await store.deliveries.get(deliveryId))?.job.state).toBe("pending");
  });

  it("retries a failed page with backoff until exhaustion, leaving the delivery alone", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    const urgency = {
      async ping() {
        return {
          ok: false,
          errorKind: "network_error",
          retryHint: "retryable",
          errorMessage: "socket hang up",
          statusCode: null,
          responseBody: null,
        } as const;
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    let clock = now;
    const worker = new OncallWorker({
      store,
      urgency,
      now: () => clock,
      resolveDestinationConfig: resolveAppCredentials,
    });

    await worker.runOnce();

    let [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({
      state: "scheduled",
      attemptCount: 1,
      lastError: "socket hang up",
    });
    expect(ping?.nextAttemptAt).toBe("2026-10-09T08:00:30.000Z");
    expect((await store.deliveries.get(deliveryId))?.job.state).toBe("pending");

    clock = "2026-10-09T08:00:31.000Z";
    await worker.runOnce();
    clock = "2026-10-09T08:02:00.000Z";

    const exhausted = await worker.runOnce();

    expect(exhausted).toMatchObject({ claimed: 1, succeeded: 0, failed: 1 });
    [ping] = await store.oncall.listForDelivery(deliveryId);
    expect(ping).toMatchObject({ state: "failed", attemptCount: 3, nextAttemptAt: null });
    expect((await store.deliveries.get(deliveryId))?.job.state).toBe("pending");
  });

  it("reclaims a stale running ping back into the queue", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);

    await store.oncall.claimNext({ now, limit: 10 });

    const worker = new OncallWorker({
      store,
      urgency: {
        async ping() {
          throw new Error("not expected");
        },
      } satisfies Pick<UrgencyRegistry, "ping">,
      now: () => "2026-10-09T09:00:00.000Z",
      resolveDestinationConfig: resolveAppCredentials,
    });
    const result = await worker.runOnce({ limit: 0 });

    expect(result).toMatchObject({ reclaimed: 1, claimed: 0 });

    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({ state: "scheduled", attemptCount: 1 });
    expect(ping?.nextAttemptAt).toBe("2026-10-09T09:00:00.000Z");
  });

  it("stops a stale ping that may already have rung instead of calling twice", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    let calls = 0;

    await store.oncall.claimNext({ now, limit: 10 });

    const [claimedPing] = await store.oncall.listForDelivery(deliveryId);

    expect(claimedPing).toBeDefined();
    // The worker writes this immediately before handing the call to the
    // provider, so it proves the attempt may have reached the receiver.
    await store.oncall.markDispatchStarted({
      pingId: claimedPing!.id,
      expectedAttemptCount: claimedPing!.attemptCount,
      startedAt: now,
    });

    const worker = new OncallWorker({
      store,
      urgency: {
        async ping() {
          calls += 1;

          return { ok: true, statusCode: 200, responseBody: "{}" };
        },
      } satisfies Pick<UrgencyRegistry, "ping">,
      now: () => "2026-10-09T09:00:00.000Z",
      resolveDestinationConfig: resolveAppCredentials,
    });
    const result = await worker.runOnce();

    // Ringing again is irreversible, so the row goes terminal and the
    // deliberate re-page is left to the manual buzz path.
    expect(result).toMatchObject({ reclaimed: 1, claimed: 0, succeeded: 0, failed: 0 });
    expect(calls).toBe(0);

    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({ state: "failed", attemptCount: 1, nextAttemptAt: null });
    expect(ping?.lastError).toContain("may have been placed");
    expect(await store.oncall.claimNext({ now: "2026-10-09T09:00:00.000Z", limit: 10 })).toEqual(
      [],
    );
  });

  it("retries a stale ping that never reached the provider", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    const calls: string[] = [];

    // Claimed but no dispatch marker: the attempt died before the provider was
    // involved, so repeating it cannot ring anyone twice.
    await store.oncall.claimNext({ now, limit: 10 });

    const worker = new OncallWorker({
      store,
      urgency: {
        async ping() {
          calls.push("ping");

          return { ok: true, statusCode: 200, responseBody: "{}" };
        },
      } satisfies Pick<UrgencyRegistry, "ping">,
      now: () => "2026-10-09T09:00:00.000Z",
      resolveDestinationConfig: resolveAppCredentials,
    });
    const result = await worker.runOnce();

    expect(result).toMatchObject({ reclaimed: 1, claimed: 1, succeeded: 1 });
    expect(calls).toHaveLength(1);

    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({
      state: "fired",
      attemptCount: 2,
      firedAt: "2026-10-09T09:00:00.000Z",
    });
  });

  it("rings each receiver at most once when a slow batch is reclaimed", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    const delivery = await store.deliveries.get(deliveryId);

    expect(delivery).toBeDefined();

    // A second receiver turns the batch into a queue: the first call blocks
    // while the second ping is already claimed but not yet dialled.
    await store.oncall.enqueueForDelivery({
      deliveryId,
      destinationId: "destination-1",
      eventId: delivery!.event.id,
      fingerprint: "checkout:unavailable",
      receiver: "ou_2",
      channel: "feishu_urgent_phone",
      providerReference: messageReference,
      trigger: "manual",
      dedupeWindowStartsAt: "2026-10-09T07:55:00.000Z",
    });

    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstCallReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstCallStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const urgency = {
      async ping(_kind, input) {
        calls.push(input.receivers[0]!);

        if (calls.length === 1) {
          markFirstStarted();
          await firstCallReleased;
        }

        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const batchWorker = new OncallWorker({
      store,
      urgency,
      now: () => now,
      resolveDestinationConfig: resolveAppCredentials,
    });
    const batchRun = batchWorker.runOnce({ limit: 2 });

    await firstCallStarted;

    // Six minutes later a manual page starts another worker while the batch is
    // still dialling. The waiting ping is past the five-minute stale window, so
    // the second worker reclaims and re-claims it.
    const later = "2026-10-09T08:06:00.000Z";
    const manualWorker = new OncallWorker({
      store,
      urgency,
      now: () => later,
      resolveDestinationConfig: resolveAppCredentials,
    });

    await manualWorker.runOnce();

    releaseFirst();
    await batchRun;

    // The batch worker must not dial the ping another attempt now owns.
    expect(calls.toSorted()).toEqual(["ou_1", "ou_2"]);

    for (const ping of await store.oncall.listForDelivery(deliveryId)) {
      expect(ping.state).toBe("fired");
    }
  });

  it("stops a page the platform can never serve and keeps the operator hint", async () => {
    // Quota/permission rejections are documented as permanent for the same
    // request, so the ping must go failed on the first attempt, not burn calls.
    const store = await createStore();
    const deliveryId = await seedPing(store);
    let pings = 0;
    const urgency = {
      async ping() {
        pings += 1;

        return {
          ok: false,
          errorKind: "target_rejected",
          retryHint: "not_retryable",
          errorMessage:
            "Feishu returned code 230024: Reach the upper limit of urgent message. Fix: ask the Feishu administrator about 加急额度",
          statusCode: 200,
          responseBody: null,
        } as const;
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const worker = new OncallWorker({
      store,
      urgency,
      now: () => now,
      resolveDestinationConfig: resolveAppCredentials,
    });

    const result = await worker.runOnce();

    expect(result).toMatchObject({ claimed: 1, succeeded: 0, failed: 1, retrying: 0 });
    expect(pings).toBe(1);

    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({ state: "failed", attemptCount: 1, nextAttemptAt: null });
    expect(ping?.lastError).toContain("230024");
    expect((await store.deliveries.get(deliveryId))?.job.state).toBe("pending");
  });
});

const resolveAppCredentials: DestinationConfigResolver = async ({ config }) => ({
  ...config,
  app: { ...(config.app as JsonObject), appId: "cli_sre", appSecret: "secret-1" },
});

function appModeConfig(): JsonObject {
  return {
    sendMode: "app",
    app: { appRef: "feishu-app-1", chatId: "oc_group" },
    urgent: {
      autoEnabled: true,
      severities: ["critical"],
      userIdType: "open_id",
      receivers: ["ou_1"],
    },
  };
}

async function createStore() {
  return openSqliteStore({ databasePath: ":memory:", now: () => now });
}

async function seedPing(store: Awaited<ReturnType<typeof createStore>>): Promise<string> {
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
    config: appModeConfig(),
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
    dedupeWindowStartsAt: "2026-10-09T07:55:00.000Z",
  });
  const job = enqueue.created[0]!;

  await store.oncall.enqueueForDelivery({
    deliveryId: job.id,
    destinationId: "destination-1",
    eventId: event.id,
    fingerprint: "checkout:unavailable",
    receiver: "ou_1",
    channel: "feishu_urgent_phone",
    providerReference: messageReference,
    trigger: "manual",
    dedupeWindowStartsAt: "2026-10-09T07:55:00.000Z",
  });

  return job.id;
}
