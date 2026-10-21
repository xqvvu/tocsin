import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { JsonObject } from "@tocsin/core";
import {
  createDefaultDestinationRegistry,
  createDefaultUrgencyRegistry,
} from "@tocsin/destinations";
import {
  createDefaultProviderRegistry,
  type ProviderParseInput,
  type ProviderParseResult,
} from "@tocsin/providers";

import { openSqliteStore, type SqliteStore } from "#/infra/sqlite/store";
import { handleSourceWebhookPost } from "#/routes/api/sources/$sourceId/webhook";
import { DeliveryWorker } from "#/server/deliveries/delivery-worker.service";
import { hashSourceToken, WebhookIntakeService } from "#/server/intake/intake.service";
import type { ApplicationContainer } from "#/server/runtime/container";

const now = "2026-06-10T08:00:00.000Z";

const testState = vi.hoisted(() => ({
  store: undefined as SqliteStore | undefined,
  parseProvider: undefined as
    | ((kind: string, input: ProviderParseInput) => ProviderParseResult)
    | undefined,
}));

vi.mock("@tocsin/providers", () => ({
  createDefaultProviderRegistry: () => ({
    parse: (kind: string, input: ProviderParseInput) => {
      if (!testState.parseProvider) {
        throw new Error("Test provider parser was not configured");
      }

      return testState.parseProvider(kind, input);
    },
  }),
}));

describe("source webhook API route", () => {
  beforeEach(async () => {
    let nextId = 0;

    testState.store = await openSqliteStore({
      databasePath: ":memory:",
      now: () => now,
      ids: {
        event: () => `event-${++nextId}`,
        delivery: () => `delivery-${++nextId}`,
        attempt: () => `attempt-${++nextId}`,
      },
    });
    testState.parseProvider = () => ({
      ok: true,
      normalized: {
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout:unavailable",
        labels: { service: "checkout" },
        occurredAt: now,
      },
      providerMetadata: {
        provider: "generic",
        parserVersion: 1,
      },
      idempotencyKey: "request-1",
    });
  });

  afterEach(async () => {
    await testState.store?.close();
    testState.store = undefined;
    testState.parseProvider = undefined;
    vi.restoreAllMocks();
  });

  it("rejects requests without a source token before reading the body", async () => {
    const response = await postWebhook({
      body: { title: "CPU high" },
    });

    expect(response.status).toBe(401);
    await expectJson(response, {
      error: "Missing source credentials",
    });
  });

  it("rejects oversized webhook payloads", async () => {
    const response = await postWebhook({
      headers: {
        authorization: "Bearer source-token",
        "content-length": String(1024 * 1024 + 1),
      },
      rawBody: "{}",
    });

    expect(response.status).toBe(413);
    await expectJson(response, {
      error: "Webhook payload exceeds 1048576 bytes",
    });
  });

  it("rejects malformed JSON webhook payloads", async () => {
    const response = await postWebhook({
      headers: {
        authorization: "Bearer source-token",
      },
      rawBody: "{not json",
    });

    expect(response.status).toBe(400);
    await expectJson(response, {
      error: "Expected JSON webhook payload",
    });
  });

  it("accepts authenticated webhooks and returns delivery counts", async () => {
    await configureSourceRouteAndDestination();

    const response = await postWebhook({
      headers: {
        authorization: "Bearer source-token",
      },
      body: {
        title: "Checkout unavailable",
        severity: "critical",
      },
    });

    expect(response.status).toBe(202);
    await expectJson(response, {
      accepted: true,
      eventId: "event-1",
      deliveriesCreated: 1,
      deliveriesDeduped: 0,
    });

    expect((await testState.store?.history.getEventDetail("event-1"))?.deliveries).toHaveLength(1);
  });

  it("accepts a webhook, delivers it asynchronously, and leaves inspectable history", async () => {
    await configureSourceRouteAndDestination({
      destinationConfig: {
        url: "https://relay.example.test/alerts",
        template: { mode: "text", text: "{{event.title}} for {{event.labels.service}}" },
      },
    });
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const response = await postWebhook({
      headers: {
        authorization: "Bearer source-token",
      },
      body: {
        title: "Checkout unavailable",
        severity: "critical",
      },
    });

    expect(response.status).toBe(202);
    await expectJson(response, {
      accepted: true,
      eventId: "event-1",
      deliveriesCreated: 1,
      deliveriesDeduped: 0,
    });

    const store = requireTestStore();
    const worker = new DeliveryWorker({
      store,
      destinations: createDefaultDestinationRegistry(),
      sendContext: {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return {
            ok: true,
            status: 202,
            text: async () => "accepted token=downstream-token",
          };
        },
      },
    });

    await expect(worker.runOnce({ now })).resolves.toEqual({
      claimed: 1,
      reclaimed: 0,
      succeeded: 1,
      failed: 0,
      retrying: 0,
      startedAt: now,
      finishedAt: now,
    });

    const eventDetail = await store.history.getEventDetail("event-1");
    const deliveryDetail = await store.deliveries.get("delivery-2");

    expect(calls[0]?.url).toBe("https://relay.example.test/alerts");
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      eventId: "event-1",
      alert: {
        title: "Checkout unavailable",
        severity: "critical",
        status: "firing",
        labels: {
          service: "checkout",
        },
      },
      message: "Checkout unavailable for checkout",
    });
    expect(eventDetail?.event.normalized).toMatchObject({
      title: "Checkout unavailable",
      severity: "critical",
      status: "firing",
      fingerprint: "checkout:unavailable",
    });
    expect(eventDetail?.routeMatches).toMatchObject([
      {
        routeId: "route-1",
        matched: true,
        destinationIds: ["destination-1"],
      },
    ]);
    expect(eventDetail?.deliveries).toMatchObject([
      {
        id: "delivery-2",
        destinationName: "Ops webhook",
        routeName: "Critical checkout",
        state: "succeeded",
        attemptCount: 1,
      },
    ]);
    expect(deliveryDetail?.job).toMatchObject({
      id: "delivery-2",
      state: "succeeded",
      attemptCount: 1,
      lastError: null,
    });
    expect(deliveryDetail?.renderedPayload).toMatchObject({
      eventId: "event-1",
      message: "Checkout unavailable for checkout",
    });
    expect(deliveryDetail?.attempts).toMatchObject([
      {
        attemptNumber: 1,
        state: "succeeded",
        responseStatus: 202,
        responseBody: "accepted token=[REDACTED]",
      },
    ]);
    expect(JSON.stringify(deliveryDetail)).not.toContain("downstream-token");
  });

  it("accepts source tokens from the x-tocsin-source-token header", async () => {
    await configureSourceRouteAndDestination();

    const response = await postWebhook({
      headers: {
        "x-tocsin-source-token": "source-token",
      },
      body: {
        title: "Checkout unavailable",
        severity: "critical",
      },
    });

    expect(response.status).toBe(202);
    await expectJson(response, {
      accepted: true,
      eventId: "event-1",
      deliveriesCreated: 1,
      deliveriesDeduped: 0,
    });
    expect(
      (await testState.store?.history.getEventDetail("event-1"))?.event.rawHeaders,
    ).toMatchObject({
      "x-tocsin-source-token": "[REDACTED]",
    });
  });

  it("accepts configured additional shared secrets without a Tocsin source token", async () => {
    await configureSourceRouteAndDestination({
      sourceConfig: {
        signingSecret: "provider-secret",
      },
    });

    const response = await postWebhook({
      headers: {
        "x-tocsin-provider-secret": "provider-secret",
      },
      body: {
        title: "Checkout unavailable",
        severity: "critical",
      },
    });

    expect(response.status).toBe(202);
    await expectJson(response, {
      accepted: true,
      eventId: "event-1",
      deliveriesCreated: 1,
      deliveriesDeduped: 0,
    });
    expect(
      (await testState.store?.history.getEventDetail("event-1"))?.event.rawHeaders,
    ).toMatchObject({
      "x-tocsin-provider-secret": "[REDACTED]",
    });
  });

  it("records duplicate webhook retries as events without creating duplicate deliveries", async () => {
    await configureSourceRouteAndDestination();
    const request = {
      headers: {
        authorization: "Bearer source-token",
      },
      body: {
        title: "Checkout unavailable",
        severity: "critical",
      },
    };

    const firstResponse = await postWebhook(request);
    const secondResponse = await postWebhook(request);

    expect(firstResponse.status).toBe(202);
    await expectJson(firstResponse, {
      accepted: true,
      eventId: "event-1",
      deliveriesCreated: 1,
      deliveriesDeduped: 0,
    });
    expect(secondResponse.status).toBe(202);
    await expectJson(secondResponse, {
      accepted: true,
      eventId: "event-3",
      deliveriesCreated: 0,
      deliveriesDeduped: 1,
    });

    const events = await testState.store?.history.listEvents();
    const deliveries = await testState.store?.history.listDeliveries();

    expect(events?.items.map((event) => event.id).sort()).toEqual(["event-1", "event-3"]);
    expect(deliveries?.items.map((delivery) => delivery.id)).toEqual(["delivery-2"]);
  });

  it("rejects unknown sources without creating an audit event", async () => {
    const response = await postWebhook({
      sourceId: "missing-source",
      headers: {
        authorization: "Bearer source-token",
      },
      body: {
        title: "Checkout unavailable",
      },
    });

    expect(response.status).toBe(404);
    await expectJson(response, {
      error: "Source not found: missing-source",
      eventId: null,
    });
    expect((await testState.store?.history.listEvents())?.items).toEqual([]);
  });

  it("rejects disabled sources without creating deliveries", async () => {
    await configureSourceRouteAndDestination();
    await requireTestStore().sources.setEnabled("source-1", false);

    const response = await postWebhook({
      headers: {
        authorization: "Bearer source-token",
      },
      body: {
        title: "Checkout unavailable",
      },
    });

    expect(response.status).toBe(403);
    await expectJson(response, {
      error: "Source is disabled: source-1",
      eventId: null,
    });
    expect((await testState.store?.history.listEvents())?.items).toEqual([]);
    expect((await testState.store?.history.listDeliveries())?.items).toEqual([]);
  });

  it("rejects invalid source tokens without creating an audit event", async () => {
    await configureSourceRouteAndDestination();

    const response = await postWebhook({
      headers: {
        authorization: "Bearer wrong-token",
      },
      body: {
        title: "Checkout unavailable",
      },
    });

    expect(response.status).toBe(401);
    await expectJson(response, {
      error: "Invalid source token",
      eventId: null,
    });
    expect((await testState.store?.history.listEvents())?.items).toEqual([]);
  });

  it("returns parser failures with an audit event id and no deliveries", async () => {
    await configureSourceRouteAndDestination();
    testState.parseProvider = () => ({
      ok: false,
      reason: "invalid_payload",
      message: "Unsupported provider payload",
    });

    const response = await postWebhook({
      headers: {
        authorization: "Bearer source-token",
      },
      body: {
        unexpected: true,
      },
    });

    expect(response.status).toBe(400);
    await expectJson(response, {
      error: "Provider parser rejected webhook payload",
      eventId: "event-1",
    });

    const detail = await testState.store?.history.getEventDetail("event-1");

    expect(detail?.event.normalized.labels).toMatchObject({
      parse_failed: "true",
    });
    expect(detail?.deliveries).toHaveLength(0);
  });
});

async function configureSourceRouteAndDestination(
  input: { sourceConfig?: JsonObject; destinationConfig?: JsonObject } = {},
): Promise<void> {
  const store = requireTestStore();

  await store.sources.create({
    id: "source-1",
    name: "Generic source",
    provider: "generic",
    tokenHash: hashSourceToken("source-token"),
    config: input.sourceConfig,
  });
  await store.destinations.create({
    id: "destination-1",
    name: "Ops webhook",
    kind: "generic_webhook",
    config: input.destinationConfig,
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
}

async function postWebhook(input: {
  sourceId?: string;
  headers?: HeadersInit;
  body?: unknown;
  rawBody?: string;
}): Promise<Response> {
  return handleSourceWebhookPost({
    sourceId: input.sourceId ?? "source-1",
    container: createTestContainer(),
    request: new Request(
      `https://tocsin.test/api/sources/${input.sourceId ?? "source-1"}/webhook`,
      {
        method: "POST",
        headers: input.headers,
        body: input.rawBody ?? JSON.stringify(input.body),
      },
    ),
  });
}

async function expectJson(response: Response, expected: unknown): Promise<void> {
  await expect(response.json()).resolves.toEqual(expected);
}

function requireTestStore(): SqliteStore {
  if (!testState.store) {
    throw new Error("Test store was not configured");
  }

  return testState.store;
}

function createTestContainer(): ApplicationContainer {
  return {
    getSqliteStore: async () => requireTestStore(),
    getProviderRegistry: () => createDefaultProviderRegistry(),
    getDestinationRegistry: () => createDefaultDestinationRegistry(),
    createSourceService: async () => {
      throw new Error("Configuration services are not used by webhook tests");
    },
    createDestinationService: async () => {
      throw new Error("Configuration services are not used by webhook tests");
    },
    createRouteService: async () => {
      throw new Error("Configuration services are not used by webhook tests");
    },
    createSuppressionService: async () => {
      throw new Error("Configuration services are not used by webhook tests");
    },
    createFeishuAppService: async () => {
      throw new Error("Configuration services are not used by webhook tests");
    },
    createAppSettingsService: async () => {
      throw new Error("Configuration services are not used by webhook tests");
    },
    createRuntimeInformationService: async () => {
      throw new Error("Runtime information service is not used by webhook tests");
    },
    createConfigPortabilityService: async () => {
      throw new Error("Configuration services are not used by webhook tests");
    },
    async createWebhookIntakeService() {
      return new WebhookIntakeService({
        store: requireTestStore(),
        providers: this.getProviderRegistry(),
      });
    },
    createDeliveryWorker: async () => {
      throw new Error("Delivery worker is not used by webhook route handler tests");
    },
    createEventReplayService: async () => {
      throw new Error("Event replay service is not used by webhook route handler tests");
    },
    createOperationsService: async () => {
      throw new Error("Operations service is not used by webhook route handler tests");
    },
    getUrgencyRegistry: () => createDefaultUrgencyRegistry(),
    createOncallService: async () => {
      throw new Error("On-call service is not used by webhook route handler tests");
    },
    createOncallWorker: async () => {
      throw new Error("On-call worker is not used by webhook route handler tests");
    },
    ensureOncallWorkerRunner: async () => ({
      runNow: async () => null,
      getHealth: () => ({
        state: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      }),
      stop: () => {},
    }),
    ensureDeliveryWorkerRunner: async () => ({
      runNow: async () => null,
      getHealth: () => ({
        state: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      }),
      stop: () => {},
    }),
    getBetterAuthDatabase: async () => {
      throw new Error("Auth database is not used by webhook tests");
    },
    hasRegisteredUsers: async () => false,
    getAuth: async () => {
      throw new Error("Dashboard auth is not used by webhook tests");
    },
    dispose: async () => {},
  } satisfies ApplicationContainer;
}
