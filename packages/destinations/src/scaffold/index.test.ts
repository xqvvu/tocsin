import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
import { describe, expect, it } from "vite-plus/test";

import { genericWebhookAdapter } from "./adapter";
import type { GenericWebhookConfig } from "./schema";

const input = destinationSendInput<GenericWebhookConfig>({
  destination: { kind: "generic_webhook", name: "Webhook SRE" },
  source: { name: "Alertmanager prod", provider: "alertmanager" },
  config: {
    webhookUrl: "https://hooks.example.test/services/example",
  },
});

describe("generic webhook adapter", () => {
  it("previews the payload without the webhook URL", async () => {
    const preview = await genericWebhookAdapter.preview(input);

    expect(preview).toMatchObject({
      title: expect.stringContaining("Checkout API latency high"),
      message: "p95 latency exceeded",
    });
    expect(JSON.stringify(preview)).not.toContain(input.config.webhookUrl);
  });

  it("sends the rendered payload through the injected transport", async () => {
    const fetcher = fakeFetch();

    const result = await genericWebhookAdapter.send(input, { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]?.url).toBe(input.config.webhookUrl);
    expect(fetcher.calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(fetcher.calls[0]?.init.body).toContain("Checkout API latency high");
  });

  it("classifies a failed request with the shared retry hint", async () => {
    const fetcher = fakeFetch(() => ({ ok: false, status: 503, body: "unavailable" }));

    const result = await genericWebhookAdapter.send(input, { fetch: fetcher });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "http_error",
      retryHint: "retryable",
      statusCode: 503,
    });
  });

  it("reports a template validation failure as a configuration error", async () => {
    const fetcher = fakeFetch();

    const result = await genericWebhookAdapter.send(
      {
        ...input,
        config: {
          webhookUrl: input.config.webhookUrl,
          template: {
            mode: "text",
            text: "{{event.nope}}",
          },
        },
      },
      { fetch: fetcher },
    );

    expect(fetcher.calls).toHaveLength(0);
    expect(result).toMatchObject({
      ok: false,
      errorKind: "configuration_error",
      retryHint: "not_retryable",
    });
  });
});
