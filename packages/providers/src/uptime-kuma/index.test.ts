import { describe, expect, it } from "vite-plus/test";

import { createDefaultProviderRegistry } from "#providers/registry";
import { parseUptimeKumaProvider } from "#providers/uptime-kuma/index";

const receivedAt = "2026-06-09T08:00:00.000Z";

describe("uptime kuma provider parser", () => {
  it("normalizes down notifications as firing alerts", () => {
    const result = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {
        "content-type": "application/json",
      },
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
          msg: "timeout",
          time: "2026-06-09T07:57:00Z",
        },
      },
    });

    expect(result.normalized).toEqual({
      title: "Tocsin API is firing",
      message: "[Tocsin API] is down",
      severity: "critical",
      status: "firing",
      fingerprint: "uptime_kuma:42",
      labels: {
        provider: "uptime_kuma",
        monitor: "Tocsin API",
        monitor_id: "42",
        type: "http",
        url: "https://tocsin.example.test/health",
      },
      occurredAt: "2026-06-09T07:57:00.000Z",
    });
    expect(result.providerMetadata).toMatchObject({
      provider: "uptime_kuma",
      parserVersion: 1,
    });
    expect(result.idempotencyKey).toMatch(/^uptime_kuma:/);
  });

  it("normalizes up notifications as resolved alerts", () => {
    const result = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {},
      payload: {
        msg: "[Tocsin API] is up",
        monitor: {
          id: 42,
          name: "Tocsin API",
        },
        heartbeat: {
          status: 1,
          time: "2026-06-09T08:02:00Z",
        },
      },
    });

    expect(result.normalized.status).toBe("resolved");
    expect(result.normalized.severity).toBe("info");
    expect(result.normalized.fingerprint).toBe("uptime_kuma:42");
    expect(result.normalized.occurredAt).toBe("2026-06-09T08:02:00.000Z");
  });

  it("extracts safe operational labels from Uptime Kuma 2.x notifications", () => {
    const result = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {
        authorization: "must-not-be-normalized",
        "x-forwarded-for": "203.0.113.10",
      },
      payload: {
        heartbeat: {
          monitorID: 20,
          status: 1,
          time: "2026-07-14 09:54:34.195",
          msg: "200 - OK",
          ping: 75,
          localDateTime: "2026-07-14 17:54:34",
          lastDownTime: "2026-07-14 09:52:34.195",
        },
        monitor: {
          id: 20,
          name: "Login page",
          pathName: "Services / Primary / Login page",
          url: "https://status.example.test/login",
          type: "http",
        },
        msg: "[Login page] [Up] 200 - OK",
      },
    });

    expect(result.normalized.labels).toEqual({
      provider: "uptime_kuma",
      monitor: "Login page",
      monitor_id: "20",
      monitor_path: "Services / Primary / Login page",
      url: "https://status.example.test/login",
      type: "http",
      response_time_ms: "75",
      last_down_at: "2026-07-14 09:52:34.195",
    });
    expect(JSON.stringify(result.normalized)).not.toContain("must-not-be-normalized");
    expect(JSON.stringify(result.normalized)).not.toContain("203.0.113.10");
  });

  // Uptime Kuma's heartbeat enum is 0 = DOWN, 1 = UP, 2 = PENDING (retry),
  // 3 = MAINTENANCE. Only DOWN is an outage; escalating the others to critical
  // pages on-call during planned maintenance.
  it.each([
    ["pending retry", 2],
    ["maintenance window", 3],
    ["future code", 99],
  ])("does not escalate a %s heartbeat to a critical alert", (_label, status) => {
    const result = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {},
      payload: {
        monitor: {
          id: 42,
          name: "Tocsin API",
        },
        heartbeat: {
          status,
          time: "2026-06-09T08:05:00Z",
        },
      },
    });

    expect(result.normalized.status).toBe("unknown");
    expect(result.normalized.severity).toBe("info");
    expect(result.normalized.title).toBe("Tocsin API is unknown");
    expect(result.normalized.fingerprint).toBe("uptime_kuma:42");
    expect(JSON.stringify(result.normalized)).not.toContain("critical");
  });

  it.each([["pending"], ["maintenance"]])(
    "maps the string status %s the same way as its numeric form",
    (status) => {
      const result = parseUptimeKumaProvider({
        sourceId: "source-uptime-kuma",
        sourceName: "Uptime Kuma prod",
        receivedAt,
        headers: {},
        payload: {
          monitor: { id: 42, name: "Tocsin API" },
          heartbeat: { status },
        },
      });

      expect(result.normalized.status).toBe("unknown");
      expect(result.normalized.severity).toBe("info");
    },
  );

  it("reads the maintenance code from the heartbeatJSON alias and monitorStatus fallback", () => {
    const aliased = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {},
      payload: {
        monitor: { id: 42, name: "Tocsin API" },
        heartbeatJSON: { status: 3 },
      },
    });
    const fallback = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {},
      payload: {
        monitor: { id: 42, name: "Tocsin API" },
        monitorStatus: 3,
      },
    });

    expect(aliased.normalized.status).toBe("unknown");
    expect(aliased.normalized.severity).toBe("info");
    expect(fallback.normalized.status).toBe("unknown");
    expect(fallback.normalized.severity).toBe("info");
  });

  it("keeps idempotency keyed to the payload rather than the normalized status", () => {
    const down = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {},
      payload: {
        monitor: { id: 42, name: "Tocsin API" },
        heartbeat: { status: 0, time: "2026-06-09T08:05:00Z" },
      },
    });
    const maintenance = parseUptimeKumaProvider({
      sourceId: "source-uptime-kuma",
      sourceName: "Uptime Kuma prod",
      receivedAt,
      headers: {},
      payload: {
        monitor: { id: 42, name: "Tocsin API" },
        heartbeat: { status: 3, time: "2026-06-09T08:05:00Z" },
      },
    });

    expect(down.normalized.status).toBe("firing");
    expect(down.normalized.severity).toBe("critical");
    expect(down.idempotencyKey).not.toBe(maintenance.idempotencyKey);
  });

  it("registers Uptime Kuma in the default provider registry", () => {
    const adapter = createDefaultProviderRegistry().get("uptime_kuma");

    expect(adapter.manifest.provider).toBe("uptime_kuma");
  });

  it("rejects non-object Uptime Kuma webhook payloads", () => {
    expect(() =>
      parseUptimeKumaProvider({
        sourceId: "source-uptime-kuma",
        sourceName: "Uptime Kuma prod",
        receivedAt,
        headers: {},
        payload: "not an object",
      }),
    ).toThrow("Expected uptime_kuma webhook payload object");
  });
});
