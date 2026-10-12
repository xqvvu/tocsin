import { describe, expect, it } from "vite-plus/test";

import type { DeliveryJob } from "@tocsin/core";
import type { DestinationRegistry, DestinationSendContext } from "@tocsin/destinations";

import type {
  ClaimedDelivery,
  DeliveryRepository,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
import {
  DeliveryExecution,
  type DeliveryExecutionStore,
} from "#/server/deliveries/delivery-execution";

const now = "2026-06-09T08:00:00.000Z";

describe("delivery execution", () => {
  it("records successful sends through the delivery execution interface", async () => {
    const succeeded: Parameters<DeliveryRepository["markSucceeded"]>[0][] = [];
    const failed: Parameters<DeliveryRepository["markFailed"]>[0][] = [];
    const store = createExecutionStore({ succeeded, failed });
    const context: DestinationSendContext = {};
    const destinations = {
      async send(kind, input, sendContext) {
        expect(kind).toBe("generic_webhook");
        expect(input).toMatchObject({
          eventId: "event-1",
          payload: {
            monitor: "checkout",
            token: "[REDACTED]",
          },
          config: {
            url: "https://example.test/webhook",
          },
        });
        expect(sendContext).toBe(context);

        return {
          ok: true,
          statusCode: 202,
          responseBody: "accepted token=downstream-token",
          renderedPayload: {
            eventId: input.eventId,
            title: input.normalizedEvent.title,
          },
        };
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const execution = new DeliveryExecution({ store, destinations, sendContext: context });

    await expect(execution.execute(createClaimedDelivery(), now)).resolves.toBe("succeeded");

    expect(succeeded).toEqual([
      {
        deliveryId: "delivery-1",
        attemptId: "attempt-1",
        renderedPayload: {
          eventId: "event-1",
          title: "Checkout unavailable",
        },
        responseStatus: 202,
        responseBody: "accepted token=[REDACTED]",
        finishedAt: now,
      },
    ]);
    expect(failed).toEqual([]);
  });

  it("passes the destination provider reference through on success", async () => {
    const succeeded: Parameters<DeliveryRepository["markSucceeded"]>[0][] = [];
    const failed: Parameters<DeliveryRepository["markFailed"]>[0][] = [];
    const store = createExecutionStore({ succeeded, failed });
    const destinations = {
      async send() {
        return {
          ok: true,
          statusCode: 200,
          responseBody: null,
          renderedPayload: {},
          providerReference: { type: "feishu_message_id", value: "om_abc123" },
        };
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const execution = new DeliveryExecution({ store, destinations });

    await expect(execution.execute(createClaimedDelivery(), now)).resolves.toBe("succeeded");

    expect(succeeded).toEqual([
      expect.objectContaining({
        deliveryId: "delivery-1",
        providerReference: { type: "feishu_message_id", value: "om_abc123" },
      }),
    ]);
    expect(failed).toEqual([]);
  });

  it("triggers auto paging only for successful sends that carry a provider reference", async () => {
    const triggered: Array<{ providerReference: unknown }> = [];
    const triggerPings = async (input: { providerReference: unknown }) => {
      triggered.push(input);
    };
    const successWithReference = {
      async send() {
        return {
          ok: true,
          statusCode: 200,
          responseBody: null,
          renderedPayload: {},
          providerReference: { type: "feishu_message_id", value: "om_abc123" },
        };
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const successWithoutReference = {
      async send() {
        return { ok: true, statusCode: 200, responseBody: null, renderedPayload: {} };
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const failure = {
      async send() {
        return {
          ok: false,
          errorKind: "network_error",
          retryHint: "retryable",
          errorMessage: "socket hang up",
          statusCode: null,
          responseBody: null,
          renderedPayload: {},
        };
      },
    } satisfies Pick<DestinationRegistry, "send">;

    await new DeliveryExecution({
      store: createExecutionStore({ succeeded: [], failed: [] }),
      destinations: successWithReference,
      triggerPings,
    }).execute(createClaimedDelivery(), now);

    expect(triggered).toEqual([
      {
        delivery: expect.objectContaining({ job: expect.objectContaining({ id: "delivery-1" }) }),
        providerReference: { type: "feishu_message_id", value: "om_abc123" },
        now,
      },
    ]);

    await new DeliveryExecution({
      store: createExecutionStore({ succeeded: [], failed: [] }),
      destinations: successWithoutReference,
      triggerPings,
    }).execute(createClaimedDelivery(), now);
    await new DeliveryExecution({
      store: createExecutionStore({ succeeded: [], failed: [] }),
      destinations: failure,
      triggerPings,
    }).execute(createClaimedDelivery(), now);

    expect(triggered).toHaveLength(1);
  });

  it("keeps a delivery succeeded when the paging trigger throws", async () => {
    const succeeded: Parameters<DeliveryRepository["markSucceeded"]>[0][] = [];
    const destinations = {
      async send() {
        return {
          ok: true,
          statusCode: 200,
          responseBody: null,
          renderedPayload: {},
          providerReference: { type: "feishu_message_id", value: "om_abc123" },
        };
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const execution = new DeliveryExecution({
      store: createExecutionStore({ succeeded, failed: [] }),
      destinations,
      triggerPings: async () => {
        throw new Error("trigger exploded");
      },
    });

    await expect(execution.execute(createClaimedDelivery(), now)).resolves.toBe("succeeded");
    expect(succeeded).toHaveLength(1);
  });

  it("records failed sends with redaction and bounded retry timing", async () => {
    const succeeded: Parameters<DeliveryRepository["markSucceeded"]>[0][] = [];
    const failed: Parameters<DeliveryRepository["markFailed"]>[0][] = [];
    const store = createExecutionStore({ succeeded, failed, failedState: "pending" });
    const destinations = {
      async send() {
        return {
          ok: false,
          errorKind: "http_error",
          retryHint: "retryable",
          errorMessage: "Destination returned token=downstream-token",
          statusCode: 503,
          responseBody: "unavailable password: downstream-password",
          renderedPayload: {},
        };
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const execution = new DeliveryExecution({
      store,
      destinations,
      backoff: {
        initialDelayMs: 60_000,
        maxDelayMs: 60_000,
      },
    });

    await expect(execution.execute(createClaimedDelivery(), now)).resolves.toBe("retrying");

    expect(succeeded).toEqual([]);
    expect(failed).toEqual([
      {
        deliveryId: "delivery-1",
        attemptId: "attempt-1",
        error: "Destination returned token=[REDACTED]",
        retryAt: "2026-06-09T08:01:00.000Z",
        responseStatus: 503,
        responseBody: "unavailable password: [REDACTED]",
        finishedAt: now,
      },
    ]);
  });

  it("records non-retryable destination failures without scheduling another attempt", async () => {
    const succeeded: Parameters<DeliveryRepository["markSucceeded"]>[0][] = [];
    const failed: Parameters<DeliveryRepository["markFailed"]>[0][] = [];
    const store = createExecutionStore({ succeeded, failed, failedState: "failed" });
    const destinations = {
      async send() {
        return {
          ok: false,
          errorKind: "configuration_error",
          retryHint: "not_retryable",
          errorMessage: "Destination rejected request",
          statusCode: 400,
          responseBody: "bad config",
          renderedPayload: {},
        };
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const execution = new DeliveryExecution({ store, destinations });

    await expect(
      execution.execute(createClaimedDelivery({ attemptCount: 1, maxAttempts: 3 }), now),
    ).resolves.toBe("failed");

    expect(succeeded).toEqual([]);
    expect(failed).toEqual([
      {
        deliveryId: "delivery-1",
        attemptId: "attempt-1",
        error: "Destination rejected request",
        retryAt: null,
        responseStatus: 400,
        responseBody: "bad config",
        finishedAt: now,
      },
    ]);
  });

  it("records thrown sender errors as final failures once attempts are exhausted", async () => {
    const succeeded: Parameters<DeliveryRepository["markSucceeded"]>[0][] = [];
    const failed: Parameters<DeliveryRepository["markFailed"]>[0][] = [];
    const store = createExecutionStore({ succeeded, failed, failedState: "failed" });
    const destinations = {
      async send() {
        throw new Error("network down token=transport-token");
      },
    } satisfies Pick<DestinationRegistry, "send">;
    const execution = new DeliveryExecution({ store, destinations });

    await expect(
      execution.execute(createClaimedDelivery({ attemptCount: 1, maxAttempts: 1 }), now),
    ).resolves.toBe("failed");

    expect(succeeded).toEqual([]);
    expect(failed).toEqual([
      {
        deliveryId: "delivery-1",
        attemptId: "attempt-1",
        error: "network down token=[REDACTED]",
        retryAt: null,
        finishedAt: now,
      },
    ]);
  });
});

function createExecutionStore(input: {
  succeeded: Parameters<DeliveryRepository["markSucceeded"]>[0][];
  failed: Parameters<DeliveryRepository["markFailed"]>[0][];
  failedState?: DeliveryJob["state"];
}): DeliveryExecutionStore {
  return {
    deliveries: {
      async markSucceeded(command) {
        input.succeeded.push(command);
        return deliveryJob({
          state: "succeeded",
          finishedAt: command.finishedAt ?? now,
        });
      },
      async markFailed(command) {
        input.failed.push(command);
        return deliveryJob({
          state: input.failedState ?? "failed",
          nextAttemptAt: command.retryAt,
          lastError: command.error,
          finishedAt: command.retryAt === null ? (command.finishedAt ?? now) : null,
        });
      },
    },
  };
}

function createClaimedDelivery(input: Partial<DeliveryJob> = {}): ClaimedDelivery {
  const job = deliveryJob({
    state: "running",
    attemptCount: 1,
    maxAttempts: 3,
    ...input,
  });

  return {
    job,
    attempt: {
      id: "attempt-1",
      deliveryId: job.id,
      attemptNumber: job.attemptCount,
      state: "running",
      responseStatus: null,
      responseBody: null,
      error: null,
      startedAt: now,
      finishedAt: null,
    },
    event: {
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
      providerMetadata: {},
      rawPayload: {
        monitor: "checkout",
        token: "upstream-secret",
      },
      rawHeaders: {},
      routeMatches: null,
      receivedAt: now,
    },
    source: {
      id: "source-1",
      name: "Generic source",
      provider: "generic",
      enabled: true,
      tokenHash: "token-hash",
      config: {},
    },
    destination: {
      id: "destination-1",
      name: "Ops webhook",
      kind: "generic_webhook",
      enabled: true,
      config: {
        url: "https://example.test/webhook",
      },
      secretRefs: {},
    },
    route: null,
  };
}

function deliveryJob(input: Partial<DeliveryJob> = {}): DeliveryJob {
  return {
    id: "delivery-1",
    eventId: "event-1",
    destinationId: "destination-1",
    routeId: "route-1",
    state: "pending",
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    suppressionId: null,
    suppressedAt: null,
    suppressReason: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    ...input,
  };
}
