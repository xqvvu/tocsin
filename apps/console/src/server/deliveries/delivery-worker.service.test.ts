import { describe, expect, it } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";

import { openSqliteStore } from "#/infra/sqlite/store";
import { DeliveryWorker } from "#/server/deliveries/delivery-worker.service";
import { OncallService } from "#/server/oncall/oncall.service";

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

async function seedDelivery(
  store: Awaited<ReturnType<typeof createStore>>,
  input: { maxAttempts?: number } = {},
) {
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
    dedupeWindowStartsAt: "2026-06-09T07:55:00.000Z",
    maxAttempts: input.maxAttempts,
  });

  return enqueue.created[0]!;
}

describe("delivery worker", () => {
  it("sends claimed deliveries and records successful attempts", async () => {
    const store = await createStore();
    const delivery = await seedDelivery(store);
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        fetch: async () => ({
          ok: true,
          status: 202,
          text: async () => "accepted",
        }),
      },
    });

    const result = await worker.runOnce();
    const detail = await store.deliveries.get(delivery.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 1,
      failed: 0,
      retrying: 0,
      startedAt: now,
      finishedAt: now,
    });
    expect(detail?.job.state).toBe("succeeded");
    expect(detail?.job.attemptCount).toBe(1);
    expect(detail?.renderedPayload).toMatchObject({
      eventId: "event-1",
      alert: {
        title: "Checkout unavailable",
      },
    });
    expect(detail?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "succeeded",
        responseStatus: 202,
        responseBody: "accepted",
      },
    ]);

    await store.close();
  });

  it("sends Feishu deliveries through the default destination registry", async () => {
    const store = await createStore();

    await store.sources.create({
      id: "source-1",
      name: "Grafana source",
      provider: "grafana",
      tokenHash: "token-hash",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Feishu SRE",
      kind: "feishu",
      config: {
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      },
    });
    const route = await store.routes.create({
      id: "route-1",
      name: "Critical to Feishu",
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
      dedupeWindowStartsAt: "2026-06-09T07:55:00.000Z",
    });
    await store.settings.update({ locale: "zh-Hans", timeZone: "Asia/Shanghai" });
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ code: 0, msg: "success" }),
          };
        },
      },
    });

    const result = await worker.runOnce();
    const detail = await store.deliveries.get(enqueue.created[0]!.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 1,
      failed: 0,
      retrying: 0,
      startedAt: now,
      finishedAt: now,
    });
    expect(calls[0]?.url).toBe("https://open.feishu.cn/open-apis/bot/v2/hook/example");
    expect(detail?.renderedPayload).toMatchObject({
      msg_type: "interactive",
      card: {
        schema: "2.0",
        config: {
          summary: {
            content: "[触发中] [严重] Checkout unavailable",
          },
        },
        header: {
          title: {
            content: "Checkout unavailable",
          },
        },
      },
    });
    expect(JSON.stringify(detail?.renderedPayload)).toContain("checkout returned 503");
    expect(JSON.stringify(detail?.renderedPayload)).not.toContain("**服务**");
    expect(JSON.stringify(detail?.renderedPayload)).toContain("2026年6月9日 16:00:00");

    await store.close();
  });

  it("sends Slack deliveries through the default destination registry", async () => {
    const store = await createStore();

    await store.sources.create({
      id: "source-1",
      name: "Alertmanager source",
      provider: "alertmanager",
      tokenHash: "token-hash",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Slack SRE",
      kind: "slack",
      config: {
        webhookUrl: "https://hooks.slack.com/services/example",
      },
    });
    const route = await store.routes.create({
      id: "route-1",
      name: "Critical to Slack",
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
      dedupeWindowStartsAt: "2026-06-09T07:55:00.000Z",
    });
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return {
            ok: true,
            status: 200,
            text: async () => "ok",
          };
        },
      },
    });

    const result = await worker.runOnce();
    const detail = await store.deliveries.get(enqueue.created[0]!.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 1,
      failed: 0,
      retrying: 0,
      startedAt: now,
      finishedAt: now,
    });
    expect(calls[0]?.url).toBe("https://hooks.slack.com/services/example");
    expect(detail?.renderedPayload).toMatchObject({
      text: "[Critical] Checkout unavailable",
      blocks: expect.any(Array),
    });

    await store.close();
  });

  it("sends email deliveries through the default destination registry", async () => {
    const store = await createStore();

    await store.sources.create({
      id: "source-1",
      name: "Uptime Kuma source",
      provider: "uptime_kuma",
      tokenHash: "token-hash",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Email SRE",
      kind: "email",
      config: {
        endpointUrl: "https://mail-gateway.example.test/send",
        to: ["sre@example.test"],
        from: "tocsin@example.test",
        subjectPrefix: "[Tocsin]",
      },
    });
    const route = await store.routes.create({
      id: "route-1",
      name: "Critical to email",
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
      dedupeWindowStartsAt: "2026-06-09T07:55:00.000Z",
    });
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return {
            ok: true,
            status: 202,
            text: async () => "queued",
          };
        },
      },
    });

    const result = await worker.runOnce();
    const detail = await store.deliveries.get(enqueue.created[0]!.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 1,
      failed: 0,
      retrying: 0,
      startedAt: now,
      finishedAt: now,
    });
    expect(calls[0]?.url).toBe("https://mail-gateway.example.test/send");
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      to: ["sre@example.test"],
      from: "tocsin@example.test",
      subject: "[Tocsin] [Critical Firing] Checkout unavailable",
    });
    expect(detail?.renderedPayload).toMatchObject({
      subject: "[Tocsin] [Critical Firing] Checkout unavailable",
      metadata: {
        eventId: "event-1",
        destinationId: "destination-1",
      },
    });
    expect(detail?.renderedPayload).not.toHaveProperty("to");
    expect(detail?.renderedPayload).not.toHaveProperty("from");

    await store.close();
  });

  it("records failed attempts and schedules bounded retries with backoff", async () => {
    const store = await createStore();
    const delivery = await seedDelivery(store, { maxAttempts: 2 });
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      backoff: {
        initialDelayMs: 60_000,
        maxDelayMs: 60_000,
      },
      sendContext: {
        fetch: async () => ({
          ok: false,
          status: 503,
          text: async () => "unavailable token=downstream-token password: downstream-password",
        }),
      },
    });

    const first = await worker.runOnce();
    const afterFirst = await store.deliveries.get(delivery.id);

    expect(first).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 1,
      startedAt: now,
      finishedAt: now,
    });
    expect(afterFirst?.job.state).toBe("pending");
    expect(afterFirst?.job.nextAttemptAt).toBe("2026-06-09T08:01:00.000Z");
    expect(afterFirst?.job.lastError).toBe("Generic webhook returned HTTP 503");

    const second = await worker.runOnce({
      now: "2026-06-09T08:01:00.000Z",
    });
    const afterSecond = await store.deliveries.get(delivery.id);

    expect(second).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 0,
      failed: 1,
      retrying: 0,
      startedAt: "2026-06-09T08:01:00.000Z",
      finishedAt: "2026-06-09T08:01:00.000Z",
    });
    expect(afterSecond?.job.state).toBe("failed");
    expect(afterSecond?.job.nextAttemptAt).toBeNull();
    expect(afterSecond?.job.finishedAt).toBe("2026-06-09T08:01:00.000Z");
    expect(afterSecond?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "failed",
        responseStatus: 503,
        responseBody: "unavailable token=[REDACTED] password: [REDACTED]",
      },
      {
        attemptNumber: 2,
        state: "failed",
        responseStatus: 503,
        responseBody: "unavailable token=[REDACTED] password: [REDACTED]",
      },
    ]);
    expect(JSON.stringify(afterSecond)).not.toContain("downstream-token");
    expect(JSON.stringify(afterSecond)).not.toContain("downstream-password");

    await store.close();
  });

  it("marks transport failures from destination adapters as retryable delivery failures", async () => {
    const store = await createStore();
    const delivery = await seedDelivery(store);
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        fetch: async () => {
          throw new Error("network down token=transport-token");
        },
      },
    });

    const result = await worker.runOnce();
    const detail = await store.deliveries.get(delivery.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 1,
      startedAt: now,
      finishedAt: now,
    });
    expect(detail?.job.state).toBe("pending");
    expect(detail?.job.lastError).toBe(
      "Destination transport failed: network down token=[REDACTED]",
    );
    expect(detail?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "failed",
        error: "Destination transport failed: network down token=[REDACTED]",
      },
    ]);
    expect(JSON.stringify(detail)).not.toContain("transport-token");

    await store.close();
  });

  it("treats a timed-out destination request as a retryable delivery failure", async () => {
    const store = await createStore();
    const delivery = await seedDelivery(store, { maxAttempts: 2 });
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      backoff: {
        initialDelayMs: 60_000,
        maxDelayMs: 60_000,
      },
      sendContext: {
        timeoutMs: 10,
        fetch: async () => new Promise(() => {}),
      },
    });

    const result = await worker.runOnce();
    const detail = await store.deliveries.get(delivery.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 1,
      startedAt: now,
      finishedAt: now,
    });
    expect(detail?.job.state).toBe("pending");
    expect(detail?.job.nextAttemptAt).toBe("2026-06-09T08:01:00.000Z");
    expect(detail?.job.lastError).toBe("Destination request timed out after 10ms");
    expect(detail?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "failed",
        error: "Destination request timed out after 10ms",
      },
    ]);

    await store.close();
  });

  it("reclaims stale running deliveries before claiming new work", async () => {
    const store = await createStore();
    const delivery = await seedDelivery(store, { maxAttempts: 2 });
    const firstWorker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        timeoutMs: 0,
        fetch: async () =>
          new Promise(() => {
            // Simulate a process that claimed the job and never completed the attempt.
          }),
      },
    });

    void firstWorker.runOnce();
    await Promise.resolve();

    const running = await waitForDeliveryState(store, delivery.id, "running");

    expect(running?.job.state).toBe("running");
    expect(running?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "running",
        finishedAt: null,
      },
    ]);

    const calls: string[] = [];
    const recoveryWorker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => "2026-06-09T08:06:00.000Z",
      staleRunningTimeoutMs: 5 * 60_000,
      sendContext: {
        fetch: async (url) => {
          calls.push(String(url));
          return {
            ok: true,
            status: 202,
            text: async () => "accepted",
          };
        },
      },
    });

    const result = await recoveryWorker.runOnce();
    const recovered = await store.deliveries.get(delivery.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 1,
      succeeded: 1,
      failed: 0,
      retrying: 0,
      startedAt: "2026-06-09T08:06:00.000Z",
      finishedAt: "2026-06-09T08:06:00.000Z",
    });
    expect(calls).toEqual(["https://example.test/webhook"]);
    expect(recovered?.job.state).toBe("succeeded");
    expect(recovered?.job.attemptCount).toBe(2);
    expect(recovered?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "failed",
        error: "Delivery attempt timed out before completion",
        finishedAt: "2026-06-09T08:06:00.000Z",
      },
      {
        attemptNumber: 2,
        state: "succeeded",
        finishedAt: "2026-06-09T08:06:00.000Z",
      },
    ]);

    await store.close();
  });

  it("reclaims exhausted stale running deliveries as final failures", async () => {
    const store = await createStore();
    const delivery = await seedDelivery(store, { maxAttempts: 1 });
    const firstWorker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        timeoutMs: 0,
        fetch: async () =>
          new Promise(() => {
            // Simulate a process that claimed the job and never completed the attempt.
          }),
      },
    });

    void firstWorker.runOnce();
    await waitForDeliveryState(store, delivery.id, "running");

    const recoveryWorker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => "2026-06-09T08:06:00.000Z",
      staleRunningTimeoutMs: 5 * 60_000,
      sendContext: {
        fetch: async () => {
          throw new Error("should not send exhausted reclaimed delivery");
        },
      },
    });

    const result = await recoveryWorker.runOnce();
    const recovered = await store.deliveries.get(delivery.id);

    expect(result).toEqual({
      claimed: 0,
      reclaimed: 1,
      succeeded: 0,
      failed: 0,
      retrying: 0,
      startedAt: "2026-06-09T08:06:00.000Z",
      finishedAt: "2026-06-09T08:06:00.000Z",
    });
    expect(recovered?.job.state).toBe("failed");
    expect(recovered?.job.finishedAt).toBe("2026-06-09T08:06:00.000Z");
    expect(recovered?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "failed",
        error: "Delivery attempt timed out before completion",
      },
    ]);

    await store.close();
  });

  it("never sends or pages for a delivery suppressed at claim time, while its sibling pages normally", async () => {
    const windowStart = "2026-06-09T09:00:00.000Z";
    const windowEnd = "2026-06-09T11:00:00.000Z";
    const claimInsideWindow = "2026-06-09T10:00:00.000Z";
    const store = await createStore();

    await store.sources.create({
      id: "source-1",
      name: "Prometheus source",
      provider: "generic",
      tokenHash: "token-hash",
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Feishu SRE",
      kind: "feishu",
      config: {
        sendMode: "app",
        app: { appRef: "app-1", chatId: "oc_group", appId: "cli_sre", appSecret: "secret-1" },
        urgent: {
          autoEnabled: true,
          severities: ["critical"],
          userIdType: "open_id",
          receivers: ["ou_1", "ou_2"],
        },
      },
    });
    const route = await store.routes.create({
      id: "route-1",
      name: "All alerts",
      destinationIds: ["destination-1"],
    });
    const deliveries = [];

    for (const fingerprint of ["checkout:unavailable", "disk:full"]) {
      const event = await store.intake.recordEvent({
        sourceId: "source-1",
        idempotencyKey: `request-${fingerprint}`,
        normalized: {
          title: "Checkout unavailable",
          message: "checkout returned 503",
          severity: "critical",
          status: "firing",
          fingerprint,
          labels: { service: "checkout" },
          occurredAt: now,
        },
        rawPayload: {},
      });
      const enqueue = await store.deliveries.enqueueForEvent({
        event,
        matches: [{ routeId: route.id, destinationIds: route.destinationIds }],
        dedupeWindowStartsAt: "2026-06-09T07:55:00.000Z",
        now,
      });

      deliveries.push(enqueue.created[0]!);
    }

    const [paged, silenced] = deliveries;

    // Both were enqueued while the window was still closed: the silencing is
    // entirely the claim-time revalidation (PRD 2.4).
    expect(paged?.state).toBe("pending");
    expect(silenced?.state).toBe("pending");
    await store.suppressions.create({
      id: "suppression-1",
      name: "October database migration",
      kind: "maintenance_window",
      matcher: { fingerprints: ["disk:full"] },
      startsAt: windowStart,
      endsAt: windowEnd,
    });

    const fetchCalls: string[] = [];
    const oncall = new OncallService({ store });
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => claimInsideWindow,
      sendContext: {
        fetch: async (url) => {
          fetchCalls.push(url);
          return {
            ok: true,
            status: 200,
            text: async () =>
              url.includes("tenant_access_token")
                ? JSON.stringify({ code: 0, msg: "ok", tenant_access_token: "t-1", expire: 7200 })
                : JSON.stringify({ code: 0, msg: "success", data: { message_id: "om_1" } }),
          };
        },
      },
      triggerPings: (input) => oncall.triggerPingsForDelivery(input),
    });

    const result = await worker.runOnce();
    const pagedDetail = await store.deliveries.get(paged!.id);
    const silencedDetail = await store.deliveries.get(silenced!.id);

    expect(result).toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 1,
      failed: 0,
      retrying: 0,
      startedAt: claimInsideWindow,
      finishedAt: claimInsideWindow,
    });
    // Control arm: this fixture really does page when the delivery executes.
    expect(pagedDetail?.job.state).toBe("succeeded");
    expect(fetchCalls).toHaveLength(2);
    expect((await store.oncall.listForDelivery(paged!.id)).map((ping) => ping.receiver)).toEqual([
      "ou_1",
      "ou_2",
    ]);

    // Suppressed arm: no send, no attempt, no ping.
    expect(silencedDetail?.job).toMatchObject({
      state: "suppressed",
      suppressionId: "suppression-1",
      suppressedAt: claimInsideWindow,
      suppressReason:
        "Maintenance window 「October database migration」 matched fingerprint disk:full",
      attemptCount: 0,
    });
    expect(silencedDetail?.attempts).toEqual([]);
    expect(silencedDetail?.providerReference).toBeNull();
    expect(await store.oncall.listForDelivery(silenced!.id)).toEqual([]);

    await store.close();
  });

  it("exposes last-run health state with redacted worker failures", async () => {
    const store = await createStore();
    await seedDelivery(store);
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {
        fetch: async () => ({
          ok: true,
          status: 202,
          text: async () => "accepted",
        }),
      },
    });

    const result = await worker.runOnce();

    expect(worker.getHealth()).toEqual({
      state: "idle",
      lastStartedAt: now,
      lastFinishedAt: now,
      lastError: null,
      lastRun: result,
    });

    const failingWorker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      now: () => now,
      sendContext: {},
    });
    await store.close();

    await expect(failingWorker.runOnce()).rejects.toThrow(/driver has already been destroyed/i);
    expect(failingWorker.getHealth()).toMatchObject({
      state: "failed",
      lastStartedAt: now,
      lastFinishedAt: now,
    });
    expect(failingWorker.getHealth().lastError).not.toContain("token=");
  });
});

async function waitForDeliveryState(
  store: Awaited<ReturnType<typeof createStore>>,
  deliveryId: string,
  state: "pending" | "running" | "succeeded" | "failed",
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const detail = await store.deliveries.get(deliveryId);

    if (detail?.job.state === state) {
      return detail;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return store.deliveries.get(deliveryId);
}
