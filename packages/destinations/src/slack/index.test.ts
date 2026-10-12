import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
import { describe, expect, it } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "#destinations/registry";
import { slackSender } from "#destinations/slack/index";
import type { SlackConfig } from "#destinations/slack/index";
import { DestinationTemplateEngine } from "#destinations/template";

const input = destinationSendInput<SlackConfig>({
  destination: { kind: "slack", name: "Slack SRE" },
  source: { name: "Alertmanager prod", provider: "alertmanager" },
  config: {
    webhookUrl: "https://hooks.slack.com/services/example",
  },
});

describe("slack sender", () => {
  it("sends block-kit alert payloads through an injected transport", async () => {
    const fetcher = fakeFetch();

    const result = await slackSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]?.url).toBe(input.config.webhookUrl);
    expect(fetcher.calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
    });
    const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
      text: string;
      blocks: Array<{ type: string }>;
    };
    expect(body.text).toBe("[Critical] Checkout API latency high");
    expect(body.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "header",
        }),
        expect.objectContaining({
          type: "section",
        }),
      ]),
    );
  });

  it("reports non-ok Slack responses as delivery failures", async () => {
    const fetcher = fakeFetch(() => ({ body: "invalid_payload" }));

    const result = await slackSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "target_rejected",
      retryHint: "not_retryable",
      errorMessage: "Slack webhook returned invalid_payload",
    });
  });

  it("renders sent payloads with the same parsed template config as previews", async () => {
    const fetcher = fakeFetch();

    const result = await slackSender.send(
      {
        ...input,
        config: {
          webhookUrl: input.config.webhookUrl,
          template: {
            mode: "text",
            text: "  {{event.title}} -> {{destination.name}}  ",
          },
        },
      },
      { fetch: fetcher },
    );
    const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const messageBlock = body.blocks.find((block) => block.type === "section" && block.text?.text);

    expect(messageBlock?.text?.text).toBe("Checkout API latency high -> Slack SRE");
    expect(result.renderedPayload).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.objectContaining({
            text: "Checkout API latency high -> Slack SRE",
          }),
        }),
      ]),
    });
  });

  it("registers Slack in the default destination registry", () => {
    const adapter = createDefaultDestinationRegistry().get("slack");

    expect(adapter.manifest.kind).toBe("slack");
  });

  describe("slack_blocks template mode", () => {
    it("replaces the default blocks payload and interpolates nested string fields", async () => {
      const fetcher = fakeFetch();

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl: input.config.webhookUrl,
            template: {
              mode: "slack_blocks",
              payload: {
                text: "[{{event.severityDisplay}}] {{event.title}}",
                blocks: [
                  {
                    type: "section",
                    text: { type: "mrkdwn", text: "service={{event.labels.service}}" },
                  },
                ],
              },
            },
          },
        },
        { fetch: fetcher },
      );

      const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
        text: string;
        blocks: Array<{ text?: { text: string } }>;
      };

      expect(result.ok).toBe(true);
      expect(body.text).toContain("Checkout API latency high");
      expect(body.blocks[0]?.text?.text).toBe("service=checkout");
      // The template owns the body: no default header/fields blocks are added.
      expect(body.blocks).toHaveLength(1);
    });

    it("renders missing allow-listed labels as empty strings", () => {
      const preview = slackSender.preview({
        ...input,
        config: {
          webhookUrl: input.config.webhookUrl,
          template: {
            mode: "slack_blocks",
            payload: { text: "{{event.labels.not_set}}" },
          },
        },
      });

      expect(preview).toMatchObject({ text: "" });
    });

    it("reports unknown variables with path-level diagnostics and does not send", async () => {
      const fetcher = fakeFetch();

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl: input.config.webhookUrl,
            template: {
              mode: "slack_blocks",
              payload: {
                blocks: [{ type: "section", text: { text: "{{event.nope}}" } }],
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
              path: "template.payload.blocks.0.text.text",
              variable: "event.nope",
            },
          ],
        },
      });
    });

    it("never leaks the webhook url into the rendered payload", async () => {
      const fetcher = fakeFetch();
      const webhookUrl = "https://hooks.slack.com/services/T000/B000/super-secret";

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl,
            template: { mode: "slack_blocks", payload: { text: "{{event.title}}" } },
          },
        },
        { fetch: fetcher },
      );

      expect(result.ok).toBe(true);
      expect(JSON.stringify(result.renderedPayload)).not.toContain("super-secret");
      expect(JSON.stringify(fetcher.calls[0]?.init.body)).not.toContain("super-secret");
    });

    it("resolves bindings from each allowed scalar selector", async () => {
      const fetcher = fakeFetch();

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl: input.config.webhookUrl,
            template: {
              mode: "slack_blocks",
              payload: {
                text: "{{bindings.statusLabel}} {{bindings.severityLabel}} {{bindings.providerLabel}} {{bindings.channelLabel}}",
              },
              bindings: {
                statusLabel: {
                  select: "event.status",
                  cases: { firing: "FIRING" },
                  fallback: "UNKNOWN",
                },
                severityLabel: {
                  select: "event.severity",
                  cases: { critical: "SEV1" },
                  fallback: "SEV5",
                },
                providerLabel: {
                  select: "source.provider",
                  cases: { alertmanager: "ALERTMANAGER" },
                  fallback: "OTHER",
                },
                channelLabel: {
                  select: "destination.kind",
                  cases: { slack: "SLACK" },
                  fallback: "OTHER",
                },
              },
            },
          },
        },
        { fetch: fetcher },
      );
      const body = JSON.parse(fetcher.calls[0]?.init.body as string) as { text: string };

      expect(result.ok).toBe(true);
      expect(body.text).toBe("FIRING SEV1 ALERTMANAGER SLACK");
    });

    it("falls back when no binding case matches the selector value", async () => {
      const fetcher = fakeFetch();

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl: input.config.webhookUrl,
            template: {
              mode: "slack_blocks",
              payload: {
                blocks: [{ type: "section", text: { text: "{{bindings.statusLabel}}" } }],
              },
              bindings: {
                statusLabel: {
                  select: "event.status",
                  cases: { resolved: "RECOVERED" },
                  fallback: "UNHANDLED",
                },
              },
            },
          },
        },
        { fetch: fetcher },
      );
      const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
        blocks: Array<{ text: { text: string } }>;
      };

      expect(result.ok).toBe(true);
      // The sample event is firing, which the cases map does not cover.
      expect(body.blocks[0]?.text.text).toBe("UNHANDLED");
    });

    it("reports unknown binding references as configuration errors and does not send", async () => {
      const fetcher = fakeFetch();

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl: input.config.webhookUrl,
            template: {
              mode: "slack_blocks",
              payload: { text: "{{bindings.declared}} {{bindings.missing}}" },
              bindings: {
                declared: {
                  select: "event.status",
                  cases: { firing: "FIRING" },
                  fallback: "UNKNOWN",
                },
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
              path: "template.payload.text",
              variable: "bindings.missing",
            },
          ],
        },
      });
    });

    it("warns on declared bindings the template never references without blocking rendering", async () => {
      const template: NonNullable<SlackConfig["template"]> = {
        mode: "slack_blocks",
        payload: { text: "{{bindings.used}}" },
        bindings: {
          used: {
            select: "event.severity",
            cases: { critical: "SEV1" },
            fallback: "SEV5",
          },
          unused: {
            select: "event.status",
            cases: { firing: "FIRING" },
            fallback: "UNKNOWN",
          },
        },
      };

      expect(DestinationTemplateEngine.diagnoseDestinationTemplate(template)).toEqual([
        {
          severity: "warning",
          path: "template.bindings.unused",
          variable: "bindings.unused",
          message: "Destination template binding is not referenced: unused",
        },
      ]);

      const fetcher = fakeFetch();

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl: input.config.webhookUrl,
            template,
          },
        },
        { fetch: fetcher },
      );
      const body = JSON.parse(fetcher.calls[0]?.init.body as string) as { text: string };

      // Warnings are advisory: the alert is still delivered.
      expect(result.ok).toBe(true);
      expect(body.text).toBe("SEV1");
    });

    it("rejects config/header references in previews and never leaks the webhook url or credentials", () => {
      const webhookUrl = "https://hooks.slack.com/services/T000/B000/super-secret-path";
      const config = {
        webhookUrl,
        template: {
          mode: "slack_blocks",
          payload: {
            url: "{{config.webhookUrl}}",
            auth: "{{headers.authorization}}",
            title: "{{event.title}}",
          },
        },
      } satisfies SlackConfig;

      const preview = slackSender.preview({ ...input, config });
      const serialized = JSON.stringify(preview);

      // Out-of-allow-list paths are rejected as unknown variables; they never
      // resolve against the real destination config, so nothing sensitive leaks.
      expect(serialized).not.toContain("super-secret-path");
      expect(serialized).not.toContain("T000");
      expect(serialized).not.toContain("hooks.slack.com");
      expect(preview).toMatchObject({
        templateError: {
          diagnostics: [
            { severity: "error", path: "template.payload.url", variable: "config.webhookUrl" },
            {
              severity: "error",
              path: "template.payload.auth",
              variable: "headers.authorization",
            },
          ],
        },
      });

      // The same destination still previews when only safe variables are used.
      const safePreview = slackSender.preview({
        ...input,
        config: {
          webhookUrl,
          template: { mode: "slack_blocks", payload: { text: "{{event.title}}" } },
        },
      });

      expect(safePreview).toMatchObject({ text: "Checkout API latency high" });
      expect(JSON.stringify(safePreview)).not.toContain("super-secret-path");
    });

    it("keeps the plain text template compatible", async () => {
      const fetcher = fakeFetch();

      const result = await slackSender.send(
        {
          ...input,
          config: {
            webhookUrl: input.config.webhookUrl,
            template: { mode: "text", text: "{{event.title}}" },
          },
        },
        { fetch: fetcher },
      );
      const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
        blocks: Array<{ type: string; text?: { text: string } }>;
      };

      expect(result.ok).toBe(true);
      // Default block-kit layout is retained in text mode.
      expect(body.blocks.some((block) => block.type === "header")).toBe(true);
    });
  });
});
