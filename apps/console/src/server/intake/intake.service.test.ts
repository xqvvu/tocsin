import { describe, expect, it, vi } from "vite-plus/test";

import { createDefaultProviderRegistry } from "@tocsin/providers";

import { openSqliteStore } from "#/infra/sqlite/store";
import {
  WebhookIntakeError,
  WebhookIntakeService,
  hashSourceToken,
  verifySourceToken,
} from "#/server/intake/intake.service";

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

describe("webhook intake service", () => {
  it("verifies source tokens against persisted hashes without accepting malformed hashes", async () => {
    const tokenHash = hashSourceToken("source-token");

    expect(verifySourceToken("source-token", tokenHash)).toBe(true);
    expect(verifySourceToken("wrong-token", tokenHash)).toBe(false);
    expect(verifySourceToken("source-token", "not-a-sha256-hash")).toBe(false);
  });

  it("persists a webhook event, matches enabled routes, and enqueues deliveries", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
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

    const result = await service.acceptWebhook({
      sourceId: "source-1",
      token: "source-token",
      headers: {
        authorization: "Bearer should-not-persist",
        "content-type": "application/json",
      },
      payload: {
        id: "request-1",
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        labels: { service: "checkout" },
        password: "should-not-persist",
      },
      receivedAt: now,
    });

    expect(result.eventId).toBe("event-1");
    expect(result.createdDeliveryIds).toEqual(["delivery-2"]);
    expect(result.dedupedDeliveryCount).toBe(0);
    expect(result.matchedRoutes.map((match) => match.routeId)).toEqual(["route-1"]);

    const detail = await store.history.getEventDetail(result.eventId);

    expect(detail?.event.rawHeaders).toEqual({
      authorization: "[REDACTED]",
      "content-type": "application/json",
    });
    expect(detail?.event.rawPayload).toMatchObject({
      password: "[REDACTED]",
    });
    expect(detail?.deliveries).toHaveLength(1);

    await store.close();
  });

  it("preserves route match explanations from intake time", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
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

    const result = await service.acceptWebhook({
      sourceId: "source-1",
      token: "source-token",
      headers: {},
      payload: {
        id: "request-1",
        title: "Checkout unavailable",
        message: "checkout returned 503",
        severity: "critical",
        status: "firing",
        labels: { service: "checkout" },
      },
      receivedAt: now,
    });

    await store.routes.update("route-1", {
      name: "Warnings only",
      rule: {
        severities: ["warning"],
      },
      destinationIds: ["destination-1"],
    });

    const detail = await store.history.getEventDetail(result.eventId);

    expect(detail?.routeMatches).toMatchObject([
      {
        routeId: "route-1",
        routeName: "Critical checkout",
        matched: true,
        destinationIds: ["destination-1"],
      },
    ]);
    expect(detail?.routeMatches[0]?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "severity",
          matched: true,
          detail: "Expected one of critical, received critical",
        }),
      ]),
    );
    expect(detail?.deliveries).toMatchObject([
      {
        routeName: "Warnings only",
      },
    ]);

    await store.close();
  });

  it("records duplicate webhook events while deduping deliveries", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "All alerts",
      destinationIds: ["destination-1"],
    });

    const input = {
      sourceId: "source-1",
      token: "source-token",
      headers: {},
      payload: {
        id: "request-1",
        title: "Checkout unavailable",
        message: "checkout returned 503",
      },
      receivedAt: now,
    };

    const first = await service.acceptWebhook(input);
    const second = await service.acceptWebhook(input);

    expect(first.eventId).not.toBe(second.eventId);
    expect(first.createdDeliveryIds).toHaveLength(1);
    expect(second.createdDeliveryIds).toHaveLength(0);
    expect(second.dedupedDeliveryCount).toBe(1);

    const events = await store.history.listEvents();

    expect(events.items).toHaveLength(2);

    await store.close();
  });

  it("prunes retained raw payloads after the configured retention window", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.settings.update({
      rawPayloadRetentionDays: 1,
    });
    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
    });

    const old = await service.acceptWebhook({
      sourceId: "source-1",
      token: "source-token",
      headers: {
        "x-debug": "old",
      },
      payload: {
        id: "old-request",
        title: "Old alert",
        message: "old payload",
      },
      receivedAt: "2026-06-01T08:00:00.000Z",
    });
    const fresh = await service.acceptWebhook({
      sourceId: "source-1",
      token: "source-token",
      headers: {
        "x-debug": "fresh",
      },
      payload: {
        id: "fresh-request",
        title: "Fresh alert",
        message: "fresh payload",
      },
      receivedAt: now,
    });

    expect((await store.history.getEventDetail(old.eventId))?.event.rawPayload).toEqual({
      retentionPruned: true,
    });
    expect((await store.history.getEventDetail(old.eventId))?.event.rawHeaders).toEqual({});
    expect((await store.history.getEventDetail(fresh.eventId))?.event.rawPayload).toMatchObject({
      title: "Fresh alert",
    });

    await store.close();
  });

  it("rejects disabled sources and invalid source tokens", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
      enabled: false,
    });

    await expect(
      service.acceptWebhook({
        sourceId: "source-1",
        token: "source-token",
        headers: {},
        payload: {},
        receivedAt: now,
      }),
    ).rejects.toThrow(new WebhookIntakeError("source_disabled", "Source is disabled: source-1"));

    await store.sources.setEnabled("source-1", true);

    await expect(
      service.acceptWebhook({
        sourceId: "source-1",
        token: "wrong",
        headers: {},
        payload: {},
        receivedAt: now,
      }),
    ).rejects.toThrow(new WebhookIntakeError("invalid_token", "Invalid source token"));

    await store.close();
  });

  it("accepts configured additional shared secrets without a Tocsin source token", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
      config: {
        signingSecret: "provider-secret",
      },
    });

    const result = await service.acceptWebhook({
      sourceId: "source-1",
      headers: {
        "x-tocsin-provider-secret": "provider-secret",
      },
      payload: {
        title: "Provider signed alert",
      },
      receivedAt: now,
    });

    expect(result.accepted).toBe(true);
    expect((await store.history.getEventDetail(result.eventId))?.event.rawHeaders).toEqual({
      "x-tocsin-provider-secret": "[REDACTED]",
    });

    await store.close();
  });

  it("records parser failures as audit events without enqueuing deliveries", async () => {
    const store = await createStore();
    const providers = createDefaultProviderRegistry();
    const service = new WebhookIntakeService({
      store,
      providers,
      now: () => now,
    });

    vi.spyOn(providers, "parse").mockImplementation(() => {
      throw new Error("unsupported provider shape token=parser-token password: parser-password");
    });

    await store.sources.create({
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "All alerts",
      destinationIds: ["destination-1"],
    });

    let error: unknown;

    try {
      await service.acceptWebhook({
        sourceId: "source-1",
        token: "source-token",
        headers: {
          authorization: "Bearer should-not-persist",
        },
        payload: {
          token: "should-not-persist",
          unexpected: true,
        },
        receivedAt: now,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(WebhookIntakeError);
    expect(error).toMatchObject({
      reason: "provider_parse_failed",
      eventId: "event-1",
    });

    const detail = await store.history.getEventDetail("event-1");

    expect(detail?.event.normalized).toMatchObject({
      title: "Provider parser rejected webhook payload",
      severity: "unknown",
      status: "unknown",
      labels: {
        provider: "generic",
        parse_failed: "true",
      },
    });
    expect(detail?.event.providerMetadata).toMatchObject({
      provider: "generic",
      parseFailed: true,
      errorMessage: "unsupported provider shape token=[REDACTED] password: [REDACTED]",
    });
    expect(JSON.stringify(detail?.event.providerMetadata)).not.toContain("parser-token");
    expect(JSON.stringify(detail?.event.providerMetadata)).not.toContain("parser-password");
    expect(detail?.event.rawHeaders).toEqual({
      authorization: "[REDACTED]",
    });
    expect(detail?.event.rawPayload).toMatchObject({
      token: "[REDACTED]",
      unexpected: true,
    });
    expect(detail?.deliveries).toHaveLength(0);
    expect((await store.history.listEvents()).items).toHaveLength(1);
    expect((await store.history.listDeliveries()).items).toHaveLength(0);

    await store.close();
  });

  it("records real provider parser shape failures as audit events", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-grafana",
      name: "Grafana",
      provider: "grafana",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "Grafana checkout",
      destinationIds: ["destination-1"],
    });

    let error: unknown;

    try {
      await service.acceptWebhook({
        sourceId: "source-grafana",
        token: "source-token",
        headers: {},
        payload: "not an object",
        receivedAt: now,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(WebhookIntakeError);
    expect(error).toMatchObject({
      reason: "provider_parse_failed",
      eventId: "event-1",
    });

    const detail = await store.history.getEventDetail("event-1");

    expect(detail?.event.normalized.labels).toEqual({
      provider: "grafana",
      parse_failed: "true",
    });
    expect(detail?.event.providerMetadata).toMatchObject({
      provider: "grafana",
      parseFailed: true,
      errorMessage: "Expected grafana webhook payload object",
    });
    expect(detail?.event.rawPayload).toBe("not an object");
    expect(detail?.deliveries).toHaveLength(0);
    expect((await store.history.listDeliveries()).items).toHaveLength(0);

    await store.close();
  });

  it("accepts Grafana webhooks through configured Grafana sources", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-grafana",
      name: "Grafana",
      provider: "grafana",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "Grafana checkout",
      rule: {
        sourceIds: ["source-grafana"],
        labels: [{ key: "service", operator: "equals", value: "checkout" }],
      },
      destinationIds: ["destination-1"],
    });

    const result = await service.acceptWebhook({
      sourceId: "source-grafana",
      token: "source-token",
      headers: {},
      payload: {
        status: "firing",
        title: "[FIRING:1] CheckoutLatencyHigh",
        message: "Checkout latency is above threshold",
        commonLabels: {
          service: "checkout",
          severity: "critical",
        },
        alerts: [
          {
            status: "firing",
            labels: {
              service: "checkout",
            },
            startsAt: "2026-06-09T07:59:00Z",
            fingerprint: "grafana-fingerprint-1",
          },
        ],
      },
      receivedAt: now,
    });

    expect(result.createdDeliveryIds).toEqual(["delivery-2"]);
    expect(result.matchedRoutes.map((match) => match.routeId)).toEqual(["route-1"]);

    const detail = await store.history.getEventDetail(result.eventId);

    expect(detail?.event.normalized).toMatchObject({
      title: "[FIRING:1] CheckoutLatencyHigh",
      severity: "critical",
      status: "firing",
      fingerprint: "grafana-fingerprint-1",
    });

    await store.close();
  });

  it("accepts SigNoz webhooks through configured SigNoz sources", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-signoz",
      name: "SigNoz",
      provider: "signoz",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "SigNoz warning",
      rule: {
        sourceIds: ["source-signoz"],
        severities: ["warning"],
      },
      destinationIds: ["destination-1"],
    });

    const result = await service.acceptWebhook({
      sourceId: "source-signoz",
      token: "source-token",
      headers: {},
      payload: {
        status: "firing",
        commonLabels: {
          alertname: "HighErrorRate",
          service: "checkout",
          severity: "warning",
        },
        commonAnnotations: {
          description: "checkout error rate is above 5%",
        },
        alerts: [
          {
            status: "firing",
            labels: {
              service: "checkout",
              severity: "warning",
            },
            startsAt: "2026-06-09T07:55:00Z",
            fingerprint: "signoz-fingerprint-1",
          },
        ],
      },
      receivedAt: now,
    });

    expect(result.createdDeliveryIds).toEqual(["delivery-2"]);
    expect(result.matchedRoutes.map((match) => match.routeId)).toEqual(["route-1"]);

    const detail = await store.history.getEventDetail(result.eventId);

    expect(detail?.event.normalized).toMatchObject({
      title: "HighErrorRate",
      severity: "warning",
      status: "firing",
      fingerprint: "signoz-fingerprint-1",
    });

    await store.close();
  });

  it("accepts Uptime Kuma webhooks through configured Uptime Kuma sources", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-uptime-kuma",
      name: "Uptime Kuma",
      provider: "uptime_kuma",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "Uptime Kuma down",
      rule: {
        sourceIds: ["source-uptime-kuma"],
        statuses: ["firing"],
      },
      destinationIds: ["destination-1"],
    });

    const result = await service.acceptWebhook({
      sourceId: "source-uptime-kuma",
      token: "source-token",
      headers: {},
      payload: {
        msg: "[Tocsin API] is down",
        monitor: {
          id: 42,
          name: "Tocsin API",
          type: "http",
          url: "https://tocsin.example.test/health",
        },
        heartbeat: {
          status: 0,
          time: "2026-06-09T07:57:00Z",
        },
      },
      receivedAt: now,
    });

    expect(result.createdDeliveryIds).toEqual(["delivery-2"]);
    expect(result.matchedRoutes.map((match) => match.routeId)).toEqual(["route-1"]);

    const detail = await store.history.getEventDetail(result.eventId);

    expect(detail?.event.normalized).toMatchObject({
      title: "Tocsin API is firing",
      severity: "critical",
      status: "firing",
      fingerprint: "uptime_kuma:42",
    });

    await store.close();
  });

  it("accepts Alertmanager webhooks through configured Alertmanager sources", async () => {
    const store = await createStore();
    const service = new WebhookIntakeService({
      store,
      providers: createDefaultProviderRegistry(),
      now: () => now,
    });

    await store.sources.create({
      id: "source-alertmanager",
      name: "Alertmanager",
      provider: "alertmanager",
      tokenHash: hashSourceToken("source-token"),
    });
    await store.destinations.create({
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
    });
    await store.routes.create({
      id: "route-1",
      name: "Alertmanager critical",
      rule: {
        sourceIds: ["source-alertmanager"],
        severities: ["critical"],
      },
      destinationIds: ["destination-1"],
    });

    const result = await service.acceptWebhook({
      sourceId: "source-alertmanager",
      token: "source-token",
      headers: {},
      payload: {
        status: "firing",
        commonLabels: {
          alertname: "InstanceDown",
          service: "checkout",
          severity: "critical",
        },
        commonAnnotations: {
          description: "checkout-api-1 is down",
        },
        alerts: [
          {
            status: "firing",
            labels: {
              service: "checkout",
              severity: "critical",
            },
            startsAt: "2026-06-09T07:58:00Z",
            fingerprint: "alertmanager-fingerprint-1",
          },
        ],
      },
      receivedAt: now,
    });

    expect(result.createdDeliveryIds).toEqual(["delivery-2"]);
    expect(result.matchedRoutes.map((match) => match.routeId)).toEqual(["route-1"]);

    const detail = await store.history.getEventDetail(result.eventId);

    expect(detail?.event.normalized).toMatchObject({
      title: "InstanceDown",
      severity: "critical",
      status: "firing",
      fingerprint: "alertmanager-fingerprint-1",
    });

    await store.close();
  });
});
