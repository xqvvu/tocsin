import { describe, expect, it } from "vite-plus/test";

import type { DeliveryDetail, EventDetail } from "@tocsin/core";

import {
  buildDeliveryEvidenceBundle,
  buildEventEvidenceBundle,
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  evidenceBundleFilename,
  serializeEvidenceBundle,
} from "#/features/operations/model/evidence-bundle";

const now = new Date("2026-10-21T01:35:00.000Z");

describe("event evidence bundle", () => {
  it("names the subject at the top level and keeps the detail document intact", () => {
    const detail = eventDetail();
    const bundle = buildEventEvidenceBundle(detail, { now });

    expect(bundle.schemaVersion).toBe(EVIDENCE_BUNDLE_SCHEMA_VERSION);
    expect(bundle.kind).toBe("event");
    expect(bundle.subjectId).toBe("evt_1");
    expect(bundle.exportedAt).toBe(now.toISOString());
    expect(bundle.event?.event.normalized.title).toBe("Disk usage token=[REDACTED]");
    expect(bundle.event?.deliveries).toHaveLength(1);
  });

  it("serializes as readable JSON that parses back to the same document", () => {
    const bundle = buildEventEvidenceBundle(eventDetail(), { now });
    const text = serializeEvidenceBundle(bundle);

    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "schemaVersion": 1,');
    expect(JSON.parse(text)).toEqual(bundle);
  });

  it("redacts credentials the detail DTOs may still carry", () => {
    const text = serializeEvidenceBundle(buildEventEvidenceBundle(eventDetail(), { now }));

    // Key-shaped secrets, a nested credential, an assignment in a free-text
    // title, and a sensitive header value must all be gone.
    expect(text).not.toContain("sk-live-123");
    expect(text).not.toContain("shh-client-secret");
    expect(text).not.toContain("abcd1234");
    expect(text).not.toContain("xyz98765");
    expect(text).toContain("[REDACTED]");
  });
});

describe("delivery evidence bundle", () => {
  it("includes attempts, destination metadata, and the rendered payload", () => {
    const bundle = buildDeliveryEvidenceBundle(deliveryDetail(), { now });

    expect(bundle.kind).toBe("delivery");
    expect(bundle.subjectId).toBe("dlv_1");
    expect(bundle.delivery?.attempts).toHaveLength(1);
    expect(bundle.delivery?.renderedPayload).toMatchObject({ text: "Disk usage" });
    expect(bundle.delivery?.destinationMetadata).toMatchObject({ chatId: "oc_1" });
  });

  it("redacts signing material from the rendered payload and metadata", () => {
    const text = serializeEvidenceBundle(buildDeliveryEvidenceBundle(deliveryDetail(), { now }));

    expect(text).not.toContain("sign-me");
    expect(text).not.toContain("meta-secret");
    expect(text).toContain("[REDACTED]");
  });
});

describe("evidence bundle filename", () => {
  it("uses the kind, id, and UTC export time so downloads never collide", () => {
    const eventBundle = buildEventEvidenceBundle(eventDetail(), { now });
    const deliveryBundle = buildDeliveryEvidenceBundle(deliveryDetail(), { now });

    expect(evidenceBundleFilename(eventBundle)).toBe("tocsin-event-evt_1-20261021T013500Z.json");
    expect(evidenceBundleFilename(deliveryBundle)).toBe(
      "tocsin-delivery-dlv_1-20261021T013500Z.json",
    );
  });

  it("replaces characters that are unsafe in a filename", () => {
    const detail = eventDetail();
    detail.event.id = "evt/../1";
    const bundle = buildEventEvidenceBundle(detail, { now });

    expect(evidenceBundleFilename(bundle)).toBe("tocsin-event-evt----1-20261021T013500Z.json");
  });
});

function eventDetail(): EventDetail {
  return {
    event: {
      id: "evt_1",
      sourceId: "src_1",
      idempotencyKey: "key-1",
      normalized: {
        title: "Disk usage token=abcd1234",
        message: "Disk is almost full",
        severity: "warning",
        status: "firing",
        fingerprint: "disk-usage",
        occurredAt: "2026-10-21T01:30:00.000Z",
        labels: { host: "web-1", apiKey: "sk-live-123" },
      },
      providerMetadata: { nested: { clientSecret: "shh-client-secret" } },
      rawPayload: { alert: "disk", apiKey: "sk-live-123" },
      rawHeaders: { authorization: "Bearer xyz98765" },
      routeMatches: null,
      receivedAt: "2026-10-21T01:30:01.000Z",
    },
    rawPayloadPruned: false,
    source: { id: "src_1", name: "Grafana", provider: "grafana", enabled: true },
    routeMatches: [],
    routeMatchesProvenance: "snapshot",
    routeMatchGaps: [],
    deliveries: [
      {
        id: "dlv_1",
        eventId: "evt_1",
        destinationId: "dst_1",
        routeId: "rt_1",
        state: "succeeded",
        attemptCount: 1,
        maxAttempts: 3,
        nextAttemptAt: null,
        lastError: null,
        createdAt: "2026-10-21T01:30:02.000Z",
        updatedAt: "2026-10-21T01:30:03.000Z",
        destinationName: "On-call chat",
        routeName: "Disk alerts",
      },
    ],
  } as unknown as EventDetail;
}

function deliveryDetail(): DeliveryDetail {
  return {
    job: {
      id: "dlv_1",
      eventId: "evt_1",
      destinationId: "dst_1",
      routeId: "rt_1",
      state: "succeeded",
      attemptCount: 1,
      maxAttempts: 3,
      nextAttemptAt: null,
      lastError: null,
      createdAt: "2026-10-21T01:30:02.000Z",
      updatedAt: "2026-10-21T01:30:03.000Z",
    },
    event: eventDetail().event,
    rawPayloadPruned: false,
    source: { id: "src_1", name: "Grafana", provider: "grafana", enabled: true },
    destination: { id: "dst_1", name: "On-call chat", kind: "feishu", enabled: true },
    destinationMetadata: { chatId: "oc_1", signingSecret: "meta-secret" },
    route: null,
    renderedPayload: { text: "Disk usage", signingSecret: "sign-me" },
    providerReference: null,
    attempts: [
      {
        id: "att_1",
        deliveryId: "dlv_1",
        attemptNumber: 1,
        state: "succeeded",
        responseStatus: 200,
        responseBody: '{"ok":true}',
        error: null,
        startedAt: "2026-10-21T01:30:02.000Z",
        finishedAt: "2026-10-21T01:30:03.000Z",
      },
    ],
    pings: [],
  } as unknown as DeliveryDetail;
}
