import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
import { describe, expect, it } from "vite-plus/test";

import { genericWebhookSender } from "#destinations/generic-webhook/index";
import type { GenericWebhookConfig } from "#destinations/generic-webhook/index";

const input = destinationSendInput<GenericWebhookConfig>({
  destination: { kind: "generic_webhook", name: "Internal relay" },
  source: { name: "Grafana prod", provider: "grafana" },
  config: {
    url: "https://relay.example.test/tocsin",
    method: "POST",
    headers: {
      "X-Team": "sre",
    },
  },
});

describe("generic webhook sender", () => {
  it("sends normalized alert payloads through an injected transport", async () => {
    const fetcher = fakeFetch(() => ({ status: 202, body: "accepted" }));

    const result = await genericWebhookSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(202);
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]?.url).toBe("https://relay.example.test/tocsin");
    expect(fetcher.calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Team": "sre",
    });
    const body = fetcher.calls[0]?.init.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(body as string)).toMatchObject({
      eventId: "event-1",
      alert: {
        title: "Checkout API latency high",
        severity: "critical",
      },
    });
  });

  it("reports non-2xx responses as delivery failures", async () => {
    const fetcher = fakeFetch(() => ({ ok: false, status: 500, body: "down" }));

    const result = await genericWebhookSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "http_error",
      retryHint: "retryable",
      errorMessage: "Generic webhook returned HTTP 500",
    });
    expect(result.responseBody).toBe("down");
  });

  it("renders sent payloads with the same parsed template config as previews", async () => {
    const fetcher = fakeFetch(() => ({ status: 202, body: "accepted" }));

    const result = await genericWebhookSender.send(
      {
        ...input,
        config: {
          ...input.config,
          template: {
            mode: "text",
            text: "  {{event.title}} -> {{destination.name}}  ",
          },
        },
      },
      { fetch: fetcher },
    );
    const body = JSON.parse(fetcher.calls[0]?.init.body as string) as { message: string };

    expect(body.message).toBe("Checkout API latency high -> Internal relay");
    expect(result.renderedPayload).toMatchObject({
      message: "Checkout API latency high -> Internal relay",
    });
  });

  describe("json_payload template mode", () => {
    it("replaces the default envelope and interpolates nested string fields", async () => {
      const fetcher = fakeFetch(() => ({ status: 202, body: "accepted" }));

      const result = await genericWebhookSender.send(
        {
          ...input,
          config: {
            ...input.config,
            template: {
              mode: "json_payload",
              payload: {
                title: "{{event.title}}",
                meta: {
                  service: "{{event.labels.service}}",
                  count: 3,
                  escalated: true,
                  tags: ["critical", "{{source.provider}}"],
                },
              },
            },
          },
        },
        { fetch: fetcher },
      );

      const body = JSON.parse(fetcher.calls[0]?.init.body as string) as Record<string, unknown>;

      expect(result.ok).toBe(true);
      // Whole template replaces the envelope: no eventId/alert wrapper keys.
      expect(Object.keys(body).sort()).toEqual(["meta", "title"]);
      expect(body).toMatchObject({
        title: "Checkout API latency high",
        meta: {
          service: "checkout",
          count: 3,
          escalated: true,
          tags: ["critical", "grafana"],
        },
      });
    });

    it("renders missing allow-listed labels as empty strings", async () => {
      const preview = genericWebhookSender.preview({
        ...input,
        config: {
          ...input.config,
          template: {
            mode: "json_payload",
            payload: { missing: "{{event.labels.not_set}}" },
          },
        },
      });

      expect(preview).toMatchObject({ missing: "" });
    });

    it("reports unknown variables as path-level diagnostics", async () => {
      const fetcher = fakeFetch();

      const result = await genericWebhookSender.send(
        {
          ...input,
          config: {
            ...input.config,
            template: {
              mode: "json_payload",
              payload: {
                ok: "{{event.title}}",
                nested: [{ bad: "{{event.nope}}" }],
              },
            },
          },
        },
        { fetch: fetcher },
      );

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        errorKind: "configuration_error",
        retryHint: "not_retryable",
      });
      expect(fetcher.calls).toHaveLength(0);
      expect(result.renderedPayload).toMatchObject({
        templateError: {
          diagnostics: [
            {
              severity: "error",
              path: "template.payload.nested.0.bad",
              variable: "event.nope",
            },
          ],
        },
      });
    });

    it.each([
      "raw.title",
      "headers.authorization",
      "config.url",
      "secret.token",
      "route.id",
      "delivery.id",
    ])("rejects unsafe variable %s without sending", async (variable) => {
      const fetcher = fakeFetch();

      const result = await genericWebhookSender.send(
        {
          ...input,
          config: {
            ...input.config,
            template: {
              mode: "json_payload",
              payload: { value: `{{${variable}}}` },
            },
          },
        },
        { fetch: fetcher },
      );

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        errorKind: "configuration_error",
        retryHint: "not_retryable",
      });
      expect(fetcher.calls).toHaveLength(0);
    });

    it("rejects config/header references and never leaks the webhook url or secrets", () => {
      const baseConfig = {
        ...input.config,
        url: "https://relay.example.test/secret-path",
        headers: { "X-Team": "sre", Authorization: "Bearer super-secret-token" },
      };

      // Config/header names are outside the allow-list, so they are rejected as
      // unknown variables rather than interpolated from secret config values.
      const preview = genericWebhookSender.preview({
        ...input,
        config: {
          ...baseConfig,
          template: {
            mode: "json_payload",
            payload: {
              url: "{{config.url}}",
              header: "{{headers.authorization}}",
              title: "{{event.title}}",
            },
          },
        },
      });
      const serialized = JSON.stringify(preview);

      expect(serialized).not.toContain("super-secret-token");
      expect(serialized).not.toContain("secret-path");
      expect(preview).toMatchObject({
        templateError: {
          diagnostics: [
            { path: "template.payload.url", variable: "config.url" },
            { path: "template.payload.header", variable: "headers.authorization" },
          ],
        },
      });

      // The same destination keeps rendering when only safe variables are used.
      const safePreview = genericWebhookSender.preview({
        ...input,
        config: {
          ...baseConfig,
          template: { mode: "json_payload", payload: { title: "{{event.title}}" } },
        },
      });

      expect(safePreview).toMatchObject({ title: "Checkout API latency high" });
    });
  });
});
