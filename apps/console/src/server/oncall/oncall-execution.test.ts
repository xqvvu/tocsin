import { describe, expect, it } from "vite-plus/test";

import type { JsonObject, ProviderReference } from "@tocsin/core";
import type { UrgencyRegistry } from "@tocsin/destinations";

import { openSqliteStore } from "#/infra/sqlite/store";
import type { DestinationConfigResolver } from "#/server/integrations/destination-config-resolver";
import { OncallExecution } from "#/server/oncall/oncall-execution";

const now = "2026-10-09T08:00:00.000Z";
const messageReference: ProviderReference = { type: "feishu_message_id", value: "om_123" };

describe("oncall execution after the provider accepts the call", () => {
  it("does not schedule another call when the fired state cannot be recorded", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    const calls: string[] = [];
    const urgency = {
      async ping() {
        calls.push("ping");

        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const [claimed] = await store.oncall.claimNext({ now, limit: 1 });

    expect(claimed).toBeDefined();

    const execution = new OncallExecution({
      store: {
        oncall: {
          markDispatchStarted: (command) => store.oncall.markDispatchStarted(command),
          async markFired() {
            throw new Error("database is locked");
          },
          markFailed: (command) => store.oncall.markFailed(command),
        },
      },
      urgency,
      resolveDestinationConfig: resolveAppCredentials,
    });

    await expect(execution.execute(claimed!, now)).resolves.toBe("failed");

    expect(calls).toHaveLength(1);

    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({ state: "failed", nextAttemptAt: null });
    expect(ping?.lastError).toContain("Urgent call was placed");
    // A terminal row is not claimable, so the engineer is not called twice.
    expect(await store.oncall.claimNext({ now, limit: 10 })).toEqual([]);
  });

  it("keeps the call fired when the retried write succeeds", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    let marks = 0;
    const urgency = {
      async ping() {
        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const [claimed] = await store.oncall.claimNext({ now, limit: 1 });

    expect(claimed).toBeDefined();

    const execution = new OncallExecution({
      store: {
        oncall: {
          markDispatchStarted: (command) => store.oncall.markDispatchStarted(command),
          async markFired(command) {
            marks += 1;

            if (marks === 1) {
              throw new Error("database is locked");
            }

            return store.oncall.markFired(command);
          },
          markFailed: (command) => store.oncall.markFailed(command),
        },
      },
      urgency,
      resolveDestinationConfig: resolveAppCredentials,
    });

    await expect(execution.execute(claimed!, now)).resolves.toBe("fired");

    expect(marks).toBe(2);

    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({ state: "fired", firedAt: now, lastError: null });
  });

  it("resolves without rejecting when neither write can be recorded", async () => {
    const store = await createStore();
    await seedPing(store);
    const urgency = {
      async ping() {
        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const [claimed] = await store.oncall.claimNext({ now, limit: 1 });

    expect(claimed).toBeDefined();

    const execution = new OncallExecution({
      store: {
        oncall: {
          markDispatchStarted: (command) => store.oncall.markDispatchStarted(command),
          async markFired() {
            throw new Error("database is locked");
          },
          async markFailed() {
            throw new Error("database is locked");
          },
        },
      },
      urgency,
      resolveDestinationConfig: resolveAppCredentials,
    });

    // One bad row must not abort the batch and must not cause a second call.
    await expect(execution.execute(claimed!, now)).resolves.toBe("failed");
  });
});

describe("oncall execution dispatch intent", () => {
  it("records the dispatch intent before asking the provider to ring", async () => {
    const store = await createStore();
    await seedPing(store);
    const order: string[] = [];
    const urgency = {
      async ping() {
        order.push("ping");

        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const [claimed] = await store.oncall.claimNext({ now, limit: 1 });

    expect(claimed).toBeDefined();

    const execution = new OncallExecution({
      store: {
        oncall: {
          async markDispatchStarted(command) {
            order.push("markDispatchStarted");

            return store.oncall.markDispatchStarted(command);
          },
          markFired: (command) => store.oncall.markFired(command),
          markFailed: (command) => store.oncall.markFailed(command),
        },
      },
      urgency,
      resolveDestinationConfig: resolveAppCredentials,
    });

    await expect(execution.execute(claimed!, now)).resolves.toBe("fired");

    // The marker only protects the reclaim path if it is durable before the
    // provider can ring; writing it afterwards would prove nothing.
    expect(order).toEqual(["markDispatchStarted", "ping"]);
  });

  it("still rings when the dispatch intent cannot be recorded", async () => {
    const store = await createStore();
    await seedPing(store);
    const calls: string[] = [];
    const urgency = {
      async ping() {
        calls.push("ping");

        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const [claimed] = await store.oncall.claimNext({ now, limit: 1 });

    expect(claimed).toBeDefined();

    const execution = new OncallExecution({
      store: {
        oncall: {
          // Paging must never depend on bookkeeping: this write is best-effort
          // and degrades to the pre-marker behavior for this attempt.
          async markDispatchStarted() {
            throw new Error("database is locked");
          },
          markFired: (command) => store.oncall.markFired(command),
          markFailed: (command) => store.oncall.markFailed(command),
        },
      },
      urgency,
      resolveDestinationConfig: resolveAppCredentials,
    });

    await expect(execution.execute(claimed!, now)).resolves.toBe("fired");

    expect(calls).toEqual(["ping"]);
  });

  it("does not dial when a reclaim handed the ping to another attempt", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    const calls: string[] = [];
    const urgency = {
      async ping() {
        calls.push("ping");

        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const [staleClaim] = await store.oncall.claimNext({ now, limit: 1 });

    expect(staleClaim).toBeDefined();

    // The batch ran past the stale window and another worker re-claimed it.
    await store.oncall.reclaimStaleRunning({
      staleBefore: "2026-10-09T08:06:00.000Z",
      now: "2026-10-09T08:06:00.000Z",
    });
    const [freshClaim] = await store.oncall.claimNext({
      now: "2026-10-09T08:06:01.000Z",
      limit: 10,
    });

    expect(freshClaim?.ping.attemptCount).toBe(2);

    const execution = new OncallExecution({
      store,
      urgency,
      resolveDestinationConfig: resolveAppCredentials,
    });

    await expect(execution.execute(staleClaim!, now)).resolves.toBe("superseded");
    expect(calls).toEqual([]);

    // The old attempt must not rewrite the row the new attempt now owns.
    const [ping] = await store.oncall.listForDelivery(deliveryId);

    expect(ping).toMatchObject({
      state: "running",
      attemptCount: 2,
      updatedAt: "2026-10-09T08:06:01.000Z",
    });
  });

  it("anchors the dispatch marker to the call, not to the batch claim", async () => {
    const store = await createStore();
    const deliveryId = await seedPing(store);
    const callTime = "2026-10-09T08:04:00.000Z";
    let seenAtDial: { updatedAt: string } | undefined;
    const urgency = {
      async ping() {
        const [ping] = await store.oncall.listForDelivery(deliveryId);

        seenAtDial = ping ? { updatedAt: ping.updatedAt } : undefined;

        return { ok: true, statusCode: 200, responseBody: "{}" };
      },
    } satisfies Pick<UrgencyRegistry, "ping">;
    const [claimed] = await store.oncall.claimNext({ now, limit: 1 });

    expect(claimed).toBeDefined();

    const execution = new OncallExecution({
      store,
      urgency,
      resolveDestinationConfig: resolveAppCredentials,
      now: () => callTime,
    });

    await expect(execution.execute(claimed!, now)).resolves.toBe("fired");
    // A batch may reach this ping minutes after claiming it; the stale window
    // must start at the call, otherwise a later tick can reclaim it mid-dial.
    expect(seenAtDial).toEqual({ updatedAt: callTime });
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
