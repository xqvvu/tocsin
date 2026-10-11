import { describe, expect, it } from "vite-plus/test";

import { createDefaultProviderRegistry } from "#providers/registry";
import { parseSignozProvider } from "#providers/signoz/index";

const receivedAt = "2026-06-09T08:00:00.000Z";

describe("signoz provider parser", () => {
  it("normalizes SigNoz Alertmanager-compatible webhook notifications", () => {
    const result = parseSignozProvider({
      sourceId: "source-signoz",
      sourceName: "SigNoz prod",
      receivedAt,
      headers: {
        "content-type": "application/json",
      },
      payload: {
        receiver: "tocsin",
        status: "firing",
        groupKey: '{}:{alertname="HighErrorRate"}',
        commonLabels: {
          alertname: "HighErrorRate",
          service: "checkout",
          severity: "warning",
        },
        commonAnnotations: {
          summary: "High error rate",
          description: "checkout error rate is above 5%",
        },
        alerts: [
          {
            status: "firing",
            labels: {
              alertname: "HighErrorRate",
              service: "checkout",
              severity: "warning",
            },
            annotations: {
              description: "checkout-api error rate is above 5%",
            },
            startsAt: "2026-06-09T07:55:00Z",
            fingerprint: "signoz-fingerprint-1",
          },
        ],
      },
    });

    expect(result.normalized).toEqual({
      title: "HighErrorRate",
      message: "checkout-api error rate is above 5%",
      severity: "warning",
      status: "firing",
      fingerprint: "signoz-fingerprint-1",
      labels: {
        alertname: "HighErrorRate",
        service: "checkout",
        severity: "warning",
      },
      occurredAt: "2026-06-09T07:55:00.000Z",
    });
    expect(result.providerMetadata).toMatchObject({
      provider: "signoz",
      parserVersion: 1,
      alertCount: 1,
      receiver: "tocsin",
      groupKey: '{}:{alertname="HighErrorRate"}',
    });
    expect(result.idempotencyKey).toMatch(/^signoz:/);
  });

  it("registers SigNoz in the default provider registry", () => {
    const adapter = createDefaultProviderRegistry().get("signoz");

    expect(adapter.manifest.provider).toBe("signoz");
  });

  it("rejects non-object SigNoz webhook payloads", () => {
    expect(() =>
      parseSignozProvider({
        sourceId: "source-signoz",
        sourceName: "SigNoz prod",
        receivedAt,
        headers: {},
        payload: "not an object",
      }),
    ).toThrow("Expected signoz webhook payload object");
  });
});
