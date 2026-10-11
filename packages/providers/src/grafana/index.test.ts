import { describe, expect, it } from "vite-plus/test";

import { parseGrafanaProvider } from "#providers/grafana/index";
import { createDefaultProviderRegistry } from "#providers/registry";

const receivedAt = "2026-06-09T08:00:00.000Z";

describe("grafana provider parser", () => {
  it("normalizes representative Grafana webhook notifications", () => {
    const result = parseGrafanaProvider({
      sourceId: "source-grafana",
      sourceName: "Grafana prod",
      receivedAt,
      headers: {
        "content-type": "application/json",
      },
      payload: {
        receiver: "tocsin",
        status: "firing",
        title: "[FIRING:1] CheckoutLatencyHigh",
        message: "Checkout latency is above threshold",
        groupKey: '{}:{alertname="CheckoutLatencyHigh"}',
        externalURL: "https://grafana.example.test/",
        commonLabels: {
          alertname: "CheckoutLatencyHigh",
          service: "checkout",
          severity: "critical",
        },
        commonAnnotations: {
          summary: "Checkout latency high",
        },
        alerts: [
          {
            status: "firing",
            labels: {
              instance: "checkout-api-1",
              service: "checkout",
              severity: "critical",
            },
            annotations: {
              description: "p95 latency is above 2s",
            },
            startsAt: "2026-06-09T07:59:00Z",
            endsAt: "0001-01-01T00:00:00Z",
            fingerprint: "grafana-fingerprint-1",
          },
        ],
      },
    });

    expect(result.normalized).toEqual({
      title: "[FIRING:1] CheckoutLatencyHigh",
      message: "Checkout latency is above threshold",
      severity: "critical",
      status: "firing",
      fingerprint: "grafana-fingerprint-1",
      labels: {
        alertname: "CheckoutLatencyHigh",
        instance: "checkout-api-1",
        service: "checkout",
        severity: "critical",
      },
      occurredAt: "2026-06-09T07:59:00.000Z",
    });
    expect(result.providerMetadata).toMatchObject({
      provider: "grafana",
      parserVersion: 1,
      alertCount: 1,
      receiver: "tocsin",
      groupKey: '{}:{alertname="CheckoutLatencyHigh"}',
      externalURL: "https://grafana.example.test/",
    });
    expect(result.idempotencyKey).toMatch(/^grafana:/);
  });

  it("registers Grafana in the default provider registry", () => {
    const adapter = createDefaultProviderRegistry().get("grafana");

    expect(adapter.manifest.provider).toBe("grafana");
  });

  it("rejects non-object Grafana webhook payloads", () => {
    expect(() =>
      parseGrafanaProvider({
        sourceId: "source-grafana",
        sourceName: "Grafana prod",
        receivedAt,
        headers: {},
        payload: "not an object",
      }),
    ).toThrow("Expected grafana webhook payload object");
  });
});
