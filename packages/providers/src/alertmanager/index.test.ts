import { describe, expect, it } from "vite-plus/test";

import { parseAlertmanagerProvider } from "#providers/alertmanager/index";
import { createDefaultProviderRegistry } from "#providers/registry";

const receivedAt = "2026-06-09T08:00:00.000Z";

describe("alertmanager provider parser", () => {
  it("normalizes representative Alertmanager webhook notifications", () => {
    const result = parseAlertmanagerProvider({
      sourceId: "source-alertmanager",
      sourceName: "Alertmanager prod",
      receivedAt,
      headers: {
        "content-type": "application/json",
      },
      payload: {
        version: "4",
        receiver: "tocsin",
        status: "firing",
        groupKey: '{}:{alertname="InstanceDown"}',
        externalURL: "https://alertmanager.example.test/",
        commonLabels: {
          alertname: "InstanceDown",
          service: "checkout",
          severity: "critical",
        },
        commonAnnotations: {
          summary: "Instance down",
          description: "checkout-api-1 is down",
        },
        alerts: [
          {
            status: "firing",
            labels: {
              alertname: "InstanceDown",
              instance: "checkout-api-1",
              service: "checkout",
              severity: "critical",
            },
            annotations: {
              description: "checkout-api-1 failed health checks",
            },
            startsAt: "2026-06-09T07:58:00Z",
            endsAt: "0001-01-01T00:00:00Z",
            generatorURL: "https://prometheus.example.test/graph?g0.expr=up",
            fingerprint: "alertmanager-fingerprint-1",
          },
        ],
      },
    });

    expect(result.normalized).toEqual({
      title: "InstanceDown",
      message: "checkout-api-1 failed health checks",
      severity: "critical",
      status: "firing",
      fingerprint: "alertmanager-fingerprint-1",
      labels: {
        alertname: "InstanceDown",
        instance: "checkout-api-1",
        service: "checkout",
        severity: "critical",
      },
      occurredAt: "2026-06-09T07:58:00.000Z",
    });
    expect(result.providerMetadata).toMatchObject({
      provider: "alertmanager",
      parserVersion: 1,
      alertCount: 1,
      receiver: "tocsin",
      groupKey: '{}:{alertname="InstanceDown"}',
      externalURL: "https://alertmanager.example.test/",
      generatorURL: "https://prometheus.example.test/graph?g0.expr=up",
    });
    expect(result.idempotencyKey).toMatch(/^alertmanager:/);
  });

  it("registers Alertmanager in the default provider registry", () => {
    const adapter = createDefaultProviderRegistry().get("alertmanager");

    expect(adapter.manifest.provider).toBe("alertmanager");
  });

  it("rejects non-object Alertmanager webhook payloads", () => {
    expect(() =>
      parseAlertmanagerProvider({
        sourceId: "source-alertmanager",
        sourceName: "Alertmanager prod",
        receivedAt,
        headers: {},
        payload: "not an object",
      }),
    ).toThrow("Expected alertmanager webhook payload object");
  });
});
