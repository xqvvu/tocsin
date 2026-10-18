import { describe, expect, it } from "vite-plus/test";

import {
  eventFromRow,
  isPrunedRawPayload,
} from "#/infra/sqlite/repositories/intake/intake.helpers";
import type { EventRow } from "#/infra/sqlite/repositories/intake/intake.interface";

function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    source_id: "source-1",
    idempotency_key: null,
    fingerprint: "cpu-high",
    severity: "critical",
    status: "firing",
    title: "CPU high",
    message: "CPU is above 90%",
    labels_json: '{"service":"api"}',
    normalized_json: "{}",
    provider_metadata_json: "{}",
    raw_payload_json: "{}",
    raw_headers_json: "{}",
    route_matches_json: null,
    received_at: "2026-10-14T00:00:00.000Z",
    occurred_at: "2026-10-14T00:00:00.000Z",
    created_at: "2026-10-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("eventFromRow", () => {
  it("rebuilds the normalized event from columns when 0003 left the empty placeholder", () => {
    const event = eventFromRow(eventRow());

    expect(event.normalized).toEqual({
      title: "CPU high",
      message: "CPU is above 90%",
      severity: "critical",
      status: "firing",
      fingerprint: "cpu-high",
      labels: { service: "api" },
      occurredAt: "2026-10-14T00:00:00.000Z",
    });
  });

  it("prefers a stored normalized object over the denormalized columns", () => {
    const event = eventFromRow(
      eventRow({
        title: "Column title",
        normalized_json: JSON.stringify({
          title: "Stored title",
          message: "Stored message",
          severity: "warning",
          status: "resolved",
          fingerprint: "stored-fingerprint",
          labels: {},
          occurredAt: "2026-10-13T00:00:00.000Z",
        }),
      }),
    );

    expect(event.normalized.title).toBe("Stored title");
    expect(event.normalized.severity).toBe("warning");
  });

  it("still rejects a non-empty normalized object that does not match the schema", () => {
    expect(() => eventFromRow(eventRow({ normalized_json: '{"title":""}' }))).toThrow(/title/i);
  });
});

describe("isPrunedRawPayload", () => {
  it("recognizes the retention sentinel", () => {
    expect(isPrunedRawPayload({ retentionPruned: true })).toBe(true);
  });

  it("does not treat a real payload carrying the same key as pruned", () => {
    expect(isPrunedRawPayload({ retentionPruned: true, title: "Fresh alert" })).toBe(false);
  });

  it("requires the sentinel value to be true", () => {
    expect(isPrunedRawPayload({ retentionPruned: false })).toBe(false);
  });

  it("rejects values that are not JSON objects", () => {
    expect(isPrunedRawPayload(null)).toBe(false);
    expect(isPrunedRawPayload(["retentionPruned"])).toBe(false);
    expect(isPrunedRawPayload("retentionPruned")).toBe(false);
  });
});
