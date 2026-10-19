import { describe, expect, it } from "vite-plus/test";

import type { OncallPing } from "@tocsin/core";

import { explainMissingUrgentPings } from "#/features/deliveries/model/urgent-ping-explanation";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";

describe("explainMissingUrgentPings", () => {
  it("says nothing when the delivery already has pings", () => {
    expect(explainMissingUrgentPings(detailFixture([pingFixture()]))).toBeNull();
  });

  it("names a non-Feishu destination first, even when the delivery also failed", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          destination: {
            id: "destination-1",
            name: "Ops webhook",
            kind: "generic_webhook",
            enabled: true,
          },
          job: { ...jobFixture(), state: "failed" },
        }),
      ),
    ).toEqual({ code: "not_feishu" });
  });

  it("explains that automatic paging only runs after a successful delivery", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          job: { ...jobFixture(), state: "failed" },
          destinationMetadata: appMetadata(),
        }),
      ),
    ).toEqual({ code: "delivery_not_succeeded", state: "failed" });
  });

  it("explains Webhook mode sends", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          destinationMetadata: { sendMode: "webhook" },
        }),
      ),
    ).toEqual({ code: "webhook_mode" });
  });

  it("explains a succeeded send that returned no message reference", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          providerReference: null,
          destinationMetadata: appMetadata(),
        }),
      ),
    ).toEqual({ code: "no_provider_reference" });
  });

  it("explains a destination with automatic paging turned off", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          destinationMetadata: appMetadata({ urgentAutoEnabled: false }),
        }),
      ),
    ).toEqual({ code: "auto_disabled" });
  });

  it("explains a destination with no urgent receivers", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          destinationMetadata: appMetadata({ urgentReceiverCount: 0 }),
        }),
      ),
    ).toEqual({ code: "no_receivers" });
  });

  it("explains a non-firing alert", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          event: eventFixture({ status: "resolved" }),
          destinationMetadata: appMetadata(),
        }),
      ),
    ).toEqual({ code: "not_firing", status: "resolved" });
  });

  it("explains a severity outside the destination's paging severities", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          event: eventFixture({ severity: "warning" }),
          destinationMetadata: appMetadata(),
        }),
      ),
    ).toEqual({ code: "severity_excluded", severity: "warning", severities: ["critical"] });
  });

  it("falls back to dedupe or a failed trigger when every gate passes", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          destinationMetadata: appMetadata({ urgentSeverities: [] }),
        }),
      ),
    ).toEqual({ code: "not_created" });
  });

  it("checks the auto gate before the severity gate", () => {
    expect(
      explainMissingUrgentPings(
        detailFixture([], {
          event: eventFixture({ severity: "warning" }),
          destinationMetadata: appMetadata({ urgentAutoEnabled: false }),
        }),
      ),
    ).toEqual({ code: "auto_disabled" });
  });
});

function appMetadata(
  overrides: Record<string, unknown> = {},
): DeliveryDetailData["destinationMetadata"] {
  return {
    sendMode: "app",
    urgentAutoEnabled: true,
    urgentReceiverCount: 2,
    urgentSeverities: ["critical"],
    ...overrides,
  };
}

function jobFixture(): DeliveryDetailData["job"] {
  return {
    id: "delivery-1",
    eventId: "event-1",
    destinationId: "destination-1",
    routeId: null,
    state: "succeeded",
    attemptCount: 1,
    maxAttempts: 5,
    nextAttemptAt: null,
    lastError: null,
    suppressionId: null,
    suppressedAt: null,
    suppressReason: null,
    createdAt: "2026-10-19T01:00:00.000Z",
    updatedAt: "2026-10-19T01:00:05.000Z",
    finishedAt: "2026-10-19T01:00:05.000Z",
  };
}

function eventFixture(
  overrides: {
    status?: "firing" | "resolved" | "unknown";
    severity?: "critical" | "warning" | "info" | "unknown";
  } = {},
): DeliveryDetailData["event"] {
  return {
    id: "event-1",
    sourceId: "source-1",
    idempotencyKey: null,
    normalized: {
      title: "Disk almost full",
      message: "disk usage 92%",
      severity: overrides.severity ?? "critical",
      status: overrides.status ?? "firing",
      fingerprint: "disk-full",
      labels: {},
      occurredAt: "2026-10-19T01:00:00.000Z",
    },
    rawPayload: {},
    rawHeaders: {},
    routeMatches: null,
    receivedAt: "2026-10-19T01:00:00.000Z",
    providerMetadata: {},
  };
}

function detailFixture(
  pings: OncallPing[],
  overrides: Partial<DeliveryDetailData> = {},
): DeliveryDetailData {
  return {
    job: jobFixture(),
    event: eventFixture(),
    source: { id: "source-1", name: "Prometheus", provider: "prometheus", enabled: true },
    destination: { id: "destination-1", name: "Ops group", kind: "feishu", enabled: true },
    destinationMetadata: appMetadata(),
    route: null,
    renderedPayload: null,
    providerReference: { type: "feishu_message_id", value: "om_abc123" },
    attempts: [],
    pings,
    ...overrides,
  } as unknown as DeliveryDetailData;
}

function pingFixture(overrides: Partial<OncallPing> = {}): OncallPing {
  return {
    id: "ping-1",
    deliveryId: "delivery-1",
    destinationId: "destination-1",
    eventId: "event-1",
    receiver: "ou_123",
    channel: "feishu_urgent_phone",
    state: "running",
    trigger: "auto",
    initiatedBy: null,
    providerReference: null,
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    createdAt: "2026-10-19T01:00:00.000Z",
    updatedAt: "2026-10-19T01:00:00.000Z",
    firedAt: null,
    ...overrides,
  };
}
