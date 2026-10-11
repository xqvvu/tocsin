import { describe, expect, it } from "vite-plus/test";

import { emailSender } from "#destinations/email/index";
import type { EmailConfig } from "#destinations/email/index";
import { createDefaultDestinationRegistry } from "#destinations/registry";
import type { DestinationSendInput, FetchLike } from "#destinations/types";

const input: DestinationSendInput<EmailConfig> = {
  eventId: "event-1",
  source: {
    id: "source-1",
    name: "Uptime Kuma prod",
    provider: "uptime_kuma",
    enabled: true,
  },
  destination: {
    id: "dest-1",
    name: "Email SRE",
    kind: "email",
    enabled: true,
  },
  normalizedEvent: {
    title: "Checkout API unavailable",
    message: "health check failed",
    severity: "critical",
    status: "firing",
    fingerprint: "checkout-api",
    labels: {
      service: "checkout",
    },
    occurredAt: "2026-06-07T08:00:00.000Z",
  },
  config: {
    endpointUrl: "https://mail-gateway.example.test/send",
    to: ["sre@example.test"],
    from: "tocsin@example.test",
    subjectPrefix: "[Tocsin]",
    headers: {
      Authorization: "Bearer test-token",
    },
  },
};

describe("email sender", () => {
  it("sends rendered email payloads through an injected transport", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 202,
        text: async () => "queued",
      };
    };

    const result = await emailSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(202);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://mail-gateway.example.test/send");
    expect(calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    });
    const body = JSON.parse(calls[0]?.init.body as string) as {
      to: string[];
      from: string;
      subject: string;
      text: string;
      html: string;
      metadata: Record<string, string>;
    };
    expect(body.to).toEqual(["sre@example.test"]);
    expect(body.from).toBe("tocsin@example.test");
    expect(body.subject).toBe("[Tocsin] [Critical Firing] Checkout API unavailable");
    expect(body.text).toContain("health check failed");
    expect(body.text).toContain("Labels: service=checkout");
    expect(body.html).toContain("Checkout API unavailable");
    expect(body.metadata).toMatchObject({
      eventId: "event-1",
      fingerprint: "checkout-api",
      severity: "critical",
      status: "firing",
    });
    expect(result.renderedPayload).toMatchObject({
      subject: "[Tocsin] [Critical Firing] Checkout API unavailable",
    });
    expect(result.renderedPayload).not.toHaveProperty("to");
    expect(result.renderedPayload).not.toHaveProperty("from");
    expect(result.renderedPayload).not.toHaveProperty("replyTo");
  });

  it("reports non-2xx email gateway responses as delivery failures", async () => {
    const fetcher: FetchLike = async () => ({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });

    const result = await emailSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "http_error",
      retryHint: "retryable",
      errorMessage: "Email gateway returned HTTP 502",
    });
    expect(result.responseBody).toBe("bad gateway");
  });

  it("registers email in the default destination registry", () => {
    const adapter = createDefaultDestinationRegistry().get("email");

    expect(adapter.manifest.kind).toBe("email");
  });
});
