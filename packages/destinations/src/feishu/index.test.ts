import { destinationSendInput, fakeFetch } from "@tocsin/destinations/test-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  createFeishuSign,
  defaultFeishuCardBindings,
  BUILT_IN_FEISHU_ALERT_CARD_ID,
  BUILT_IN_FEISHU_ALERT_CARD_VERSION,
  FeishuConfigSchema,
  feishuSender,
} from "#destinations/feishu/index";
import type { FeishuConfig } from "#destinations/feishu/index";
import { createDefaultDestinationRegistry } from "#destinations/registry";

import signozTemplate from "../../../../examples/feishu/signoz-template.json" with { type: "json" };
import uptimeKumaTemplate from "../../../../examples/feishu/uptime-kuma-template.json" with { type: "json" };

const input = destinationSendInput<FeishuConfig>({
  destination: { kind: "feishu", name: "Feishu SRE" },
  source: { name: "Grafana prod", provider: "grafana" },
  config: {
    sendMode: "webhook",
    webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    signSecret: "secret",
    template: {
      source: "custom",
      mode: "text",
      text: "[{{event.severity}}] {{event.title}}\n{{event.message}}\nStatus: {{event.status}}",
    },
  },
});

const webhookSuccessBody = JSON.stringify({ code: 0, msg: "success" });

describe("feishu sender", () => {
  it("renders the SigNoz example with alert context, dotted keys, and action links", async () => {
    const ruleUrl =
      "https://signoz.example.test/alerts/edit?ruleId=019ebfb1-c154-7b40-bcbd-cc841780b3ad";
    const logsUrl = "https://signoz.example.test/logs/logs-explorer?query=llm-response-empty";
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      template: {
        mode: "feishu_card",
        card: signozTemplate,
        bindings: defaultFeishuCardBindings,
      },
    });

    const preview = await feishuSender.preview({
      ...input,
      source: {
        ...input.source,
        name: "SigNoz prod",
        provider: "signoz",
      },
      normalizedEvent: {
        ...input.normalizedEvent,
        title: "LLM empty response",
        message: "LLM returned an empty response 3 times in a row",
        severity: "critical",
        status: "firing",
        fingerprint: "d23d1e1ec71befd6",
      },
      payload: {
        status: "firing",
        commonLabels: {
          alertname: "LLM empty response",
          core: "model",
          ruleId: "019ebfb1-c154-7b40-bcbd-cc841780b3ad",
          ruleSource: ruleUrl,
          severity: "critical",
          "threshold.name": "critical",
        },
        commonAnnotations: {
          description: "LLM returned an empty response 3 times in a row",
          related_logs: logsUrl,
          summary: "LLM empty responses are occurring frequently",
        },
        alerts: [
          {
            startsAt: "2026-07-06T07:39:07.585456709Z",
            fingerprint: "d23d1e1ec71befd6",
          },
        ],
      },
      config,
      presentation: { locale: "en-US", timeZone: "Asia/Shanghai" },
    });
    const serialized = JSON.stringify(preview);

    expect(preview).toMatchObject({
      msg_type: "interactive",
      card: {
        header: {
          template: "red",
          title: { content: "LLM empty response" },
          text_tag_list: [{ color: "red" }, { color: "grey" }],
        },
      },
    });
    expect(serialized).toContain("model");
    expect(serialized).toContain("Threshold: critical");
    expect(serialized).toContain(ruleUrl);
    expect(serialized).toContain(logsUrl);
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("x-forwarded-for");
  });

  it("renders FastGPT recovered probes with model identity, attempts, and response time", async () => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    });
    const preview = await feishuSender.preview({
      ...input,
      source: { ...input.source, name: "FastGPT 模型探测", provider: "fastgpt" },
      normalizedEvent: {
        ...input.normalizedEvent,
        title: "speech-01-turbo model probe recovered",
        message: "MiniMax tts model probe recovered after 1 attempt in 295 ms",
        severity: "info",
        status: "resolved",
        fingerprint: "fastgpt:6a995e6514161dc586c6cded",
        labels: {
          provider: "fastgpt",
          model: "speech-01-turbo",
          model_name: "speech-01-turbo",
          model_id: "6a995e6514161dc586c6cded",
          model_provider: "MiniMax",
          model_type: "tts",
          probe_attempts: "1",
          probe_latency_ms: "295",
        },
      },
      payload: {
        event: "model_status_recovered",
        model: {
          model: "speech-01-turbo",
          modelId: "6a995e6514161dc586c6cded",
          name: "speech-01-turbo",
          provider: "MiniMax",
          type: "tts",
        },
        probe: { attempts: 1, latencyMs: 295 },
        status: "green",
      },
      config,
      presentation: { locale: "en-US", timeZone: "Asia/Shanghai" },
    });
    const serialized = JSON.stringify(preview);

    expect(serialized).toContain("FastGPT model probe");
    expect(serialized).toContain("speech-01-turbo");
    expect(serialized).toContain("The model is responding again.");
    expect(serialized).toContain("MiniMax · Text-to-speech");
    expect(serialized).toContain("295 ms");
    expect(serialized).toContain("Model ID");
    expect(serialized).not.toContain("Uptime Kuma");
    expect(serialized).not.toContain("Check URL");
  });

  it("shows a concise FastGPT failure reason, and omits response time when absent", async () => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    });
    const preview = await feishuSender.preview({
      ...input,
      source: { ...input.source, name: "FastGPT 模型探测", provider: "fastgpt" },
      normalizedEvent: {
        ...input.normalizedEvent,
        title: "speech-01-turbo model probe failed",
        message:
          "MiniMax tts model probe failed after 4 attempts: 500 upstream_error: bad_response",
        severity: "critical",
        status: "firing",
        fingerprint: "fastgpt:6a995e6514161dc586c6cded",
        labels: {
          provider: "fastgpt",
          model_name: "speech-01-turbo",
          model_id: "6a995e6514161dc586c6cded",
          model_provider: "MiniMax",
          model_type: "tts",
          probe_attempts: "4",
          probe_error: "500 bad_response · upstream_error",
        },
      },
      payload: {
        event: "model_status_error",
        model: {
          name: "speech-01-turbo",
          modelId: "6a995e6514161dc586c6cded",
          provider: "MiniMax",
          type: "tts",
        },
        probe: {
          attempts: 4,
          error: '500 {"code":"bad_response","credential":"MUST_NOT_APPEAR"}',
        },
        status: "red",
      },
      config,
      presentation: { locale: "en-US", timeZone: "Asia/Shanghai" },
    });
    const serialized = JSON.stringify(preview);

    expect(serialized).toContain("Probe error");
    expect(serialized).toContain("Model probe failed");
    expect(serialized).toContain("500 bad_response · upstream_error");
    expect(serialized).not.toContain("MUST_NOT_APPEAR");
    expect(serialized).toContain("4");
    expect(serialized).not.toContain("Response time");
    expect(serialized).not.toContain(" ms");
    expect(serialized).not.toContain("Uptime Kuma");
  });

  it("localizes the built-in FastGPT probe card for Chinese destinations", async () => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    });
    const preview = await feishuSender.preview({
      ...input,
      source: { ...input.source, name: "FastGPT 模型探测", provider: "fastgpt" },
      normalizedEvent: {
        ...input.normalizedEvent,
        title: "speech-01-turbo model probe recovered",
        message: "MiniMax tts model probe recovered after 1 attempt in 295 ms",
        severity: "info",
        status: "resolved",
        fingerprint: "fastgpt:6a995e6514161dc586c6cded",
        labels: {
          provider: "fastgpt",
          model_name: "speech-01-turbo",
          model_id: "6a995e6514161dc586c6cded",
          model_provider: "MiniMax",
          model_type: "tts",
          probe_attempts: "1",
          probe_latency_ms: "295",
        },
      },
      config,
      presentation: { locale: "zh-Hans", timeZone: "Asia/Shanghai" },
    });
    const serialized = JSON.stringify(preview);

    expect(serialized).toContain("FastGPT 模型探测");
    expect(serialized).toContain("模型已恢复响应");
    expect(serialized).toContain("服务商 / 类型");
    expect(serialized).toContain("响应耗时");
  });

  it("renders the Uptime Kuma example with operational details and no request headers", async () => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      template: {
        mode: "feishu_card",
        card: uptimeKumaTemplate,
        bindings: defaultFeishuCardBindings,
      },
    });

    const preview = await feishuSender.preview({
      ...input,
      source: {
        ...input.source,
        name: "Uptime Kuma prod",
        provider: "uptime_kuma",
      },
      normalizedEvent: {
        ...input.normalizedEvent,
        title: "Login page is resolved",
        message: "[Login page] [Up] 200 - OK",
        severity: "info",
        status: "resolved",
        fingerprint: "uptime_kuma:20",
        labels: {
          provider: "uptime_kuma",
          monitor: "Login page",
          monitor_id: "20",
          monitor_path: "Services / Primary / Login page",
          url: "https://status.example.test/login",
          type: "http",
          response_time_ms: "75",
          last_down_at: "2026-07-14 09:52:34.195",
        },
      },
      payload: {
        heartbeat: {
          ping: 75,
          lastDownTime: "2026-07-14 09:52:34.195",
        },
        monitor: {
          id: 20,
          name: "Login page",
          pathName: "Services / Primary / Login page",
          url: "https://status.example.test/login",
          type: "http",
        },
      },
      config,
      presentation: { locale: "en-US", timeZone: "Asia/Shanghai" },
    });
    const serialized = JSON.stringify(preview);

    expect(preview).toMatchObject({
      msg_type: "interactive",
      card: {
        header: {
          template: "green",
          title: { content: "Login page" },
        },
      },
    });
    expect(serialized).toContain("75 ms");
    expect(serialized).toContain("Services / Primary / Login page");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("x-forwarded-for");
  });

  it("uses the FastGPT card for a FastGPT event with the shipped Uptime Kuma example", async () => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      template: {
        mode: "feishu_card",
        card: uptimeKumaTemplate,
        bindings: defaultFeishuCardBindings,
      },
    });
    const preview = await feishuSender.preview({
      ...input,
      source: {
        ...input.source,
        name: "FastGPT model probe",
        provider: "fastgpt",
      },
      normalizedEvent: {
        ...input.normalizedEvent,
        title: "speech-01-turbo model probe recovered",
        message: "MiniMax tts model probe recovered after 1 attempt in 295 ms",
        severity: "info",
        status: "resolved",
        fingerprint: "fastgpt:6a995e6514161dc586c6cded",
        labels: {
          provider: "fastgpt",
          model_name: "speech-01-turbo",
          model_id: "6a995e6514161dc586c6cded",
          model_provider: "MiniMax",
          model_type: "tts",
          probe_attempts: "1",
          probe_latency_ms: "295",
        },
      },
      payload: {
        event: "model_status_recovered",
        model: {
          name: "speech-01-turbo",
          modelId: "6a995e6514161dc586c6cded",
          provider: "MiniMax",
          type: "tts",
        },
        probe: { attempts: 1, latencyMs: 295 },
        status: "green",
      },
      config,
      presentation: { locale: "en-US", timeZone: "Asia/Shanghai" },
    });
    const serialized = JSON.stringify(preview);

    expect(serialized).toContain("FastGPT model probe");
    expect(serialized).toContain("speech-01-turbo");
    expect(serialized).toContain("MiniMax · Text-to-speech");
    expect(serialized).toContain("295 ms");
    expect(serialized).not.toContain("Uptime Kuma");
    expect(serialized).not.toContain("Monitor path");
    expect(serialized).not.toContain("Check URL");
    expect(serialized).not.toContain("lastDownTime");
  });

  it.each([
    ["firing", "Model probe failed", "模型探测失败"],
    ["resolved", "The model is responding again.", "模型已恢复响应"],
    ["unknown", "Model status unknown", "模型状态未知"],
  ] as const)(
    "renders the FastGPT probe card for a %s status without claiming recovery",
    async (status, en, zh) => {
      const config = FeishuConfigSchema.parse({
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
        template: {
          mode: "feishu_card",
          card: uptimeKumaTemplate,
          bindings: defaultFeishuCardBindings,
        },
      });
      const render = (locale: "en-US" | "zh-Hans") =>
        feishuSender.preview({
          ...input,
          source: {
            ...input.source,
            name: "FastGPT model probe",
            provider: "fastgpt",
          },
          normalizedEvent: {
            ...input.normalizedEvent,
            title: "speech-01-turbo model probe",
            message: "MiniMax tts model probe",
            severity: "info",
            status,
            fingerprint: "fastgpt:6a995e6514161dc586c6cded",
            labels: {
              provider: "fastgpt",
              model_name: "speech-01-turbo",
              probe_attempts: "1",
              probe_latency_ms: "295",
            },
          },
          payload: {},
          config,
          presentation: { locale, timeZone: "UTC" },
        });

      expect(JSON.stringify(await render("en-US"))).toContain(en);
      expect(JSON.stringify(await render("zh-Hans"))).toContain(zh);

      if (status !== "resolved") {
        expect(JSON.stringify(await render("zh-Hans"))).not.toContain("模型已恢复响应");
      }
    },
  );

  it("keeps a modified Uptime Kuma custom card for FastGPT events", async () => {
    const customCard = structuredClone(uptimeKumaTemplate);
    customCard.header.title.content = "Custom monitor: {{payload.monitor.name}}";
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      template: {
        mode: "feishu_card",
        card: customCard,
        bindings: defaultFeishuCardBindings,
      },
    });
    const preview = await feishuSender.preview({
      ...input,
      source: { ...input.source, provider: "fastgpt" },
      payload: { monitor: { name: "Login page" } },
      config,
    });

    expect(preview).toMatchObject({
      card: {
        header: {
          title: { content: "Custom monitor: Login page" },
        },
      },
    });
  });

  it.each([
    ["SigNoz", signozTemplate, "Detailed description", "详细描述"],
    ["Uptime Kuma", uptimeKumaTemplate, "Check result", "检查结果"],
  ] as const)("localizes the %s example from presentation settings", async (_, card, en, zh) => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      template: {
        mode: "feishu_card",
        card,
        bindings: defaultFeishuCardBindings,
      },
    });
    expect(config.template).toMatchObject({ source: "custom", mode: "feishu_card" });
    const render = (locale: "en-US" | "zh-Hans") =>
      feishuSender.preview({
        ...input,
        payload: {},
        config,
        presentation: { locale, timeZone: "UTC" },
      });

    expect(JSON.stringify(await render("en-US"))).toContain(en);
    expect(JSON.stringify(await render("zh-Hans"))).toContain(zh);
  });

  it("uses a typed Feishu card as the default template", async () => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    });

    expect(config.template).toEqual({
      source: "builtin",
      id: BUILT_IN_FEISHU_ALERT_CARD_ID,
      version: BUILT_IN_FEISHU_ALERT_CARD_VERSION,
      bindings: defaultFeishuCardBindings,
    });

    const preview = await feishuSender.preview({
      ...input,
      config,
    });

    expect(preview).toMatchObject({
      msg_type: "interactive",
      card: {
        schema: "2.0",
        config: {
          width_mode: "compact",
          summary: {
            content: "[Firing] [Critical] Checkout API latency high",
          },
        },
        header: {
          template: "red",
          title: {
            content: "Checkout API latency high",
          },
        },
      },
    });
    expect(JSON.stringify(preview)).toContain("Alert summary");
    expect(JSON.stringify(preview)).toContain("p95 latency exceeded");
    expect(JSON.stringify(preview)).not.toContain("Service");
    expect(JSON.stringify(preview)).not.toContain("Environment");
    expect(JSON.stringify(preview)).not.toContain("secret");
  });

  it("localizes the default card and timestamp with instance presentation settings", async () => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    });
    const preview = await feishuSender.preview({
      ...input,
      config,
      presentation: { locale: "zh-Hans", timeZone: "Asia/Shanghai" },
    });
    const serialized = JSON.stringify(preview);

    expect(serialized).toContain("告警摘要");
    expect(serialized).toContain("严重");
    expect(serialized).toContain("2026年6月7日 16:00:00");
    expect(serialized).not.toContain("**服务**");
  });

  it.each([
    ["firing", "red"],
    ["resolved", "green"],
    ["unknown", "grey"],
  ] as const)("renders the default %s card with a %s header", async (status, color) => {
    const config = FeishuConfigSchema.parse({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
    });
    const preview = await feishuSender.preview({
      ...input,
      normalizedEvent: {
        ...input.normalizedEvent,
        status,
      },
      config,
    });

    expect(preview).toMatchObject({
      msg_type: "interactive",
      card: {
        header: {
          template: color,
          text_tag_list: [
            expect.anything(),
            {
              color,
            },
          ],
        },
      },
    });
  });

  it("rejects unsupported values used by Feishu color bindings", () => {
    expect(() =>
      FeishuConfigSchema.parse({
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
        template: {
          mode: "feishu_card",
          bindings: {
            statusColor: {
              select: "event.status",
              cases: { firing: "chartreuse" },
              fallback: "grey",
            },
          },
          card: {
            header: {
              template: "{{bindings.statusColor}}",
            },
          },
        },
      }),
    ).toThrow(/unsupported color: chartreuse/);
  });

  it("sends signed text messages through an injected transport", async () => {
    const fetcher = fakeFetch(() => ({ body: webhookSuccessBody }));

    const result = await feishuSender.send(input, {
      fetch: fetcher,
      now: () => new Date("2024-03-09T16:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]?.url).toBe(input.config.webhookUrl);
    expect(fetcher.calls[0]?.init.headers).toEqual({
      "Content-Type": "application/json",
    });
    const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
      msg_type: string;
      content: { text: string };
      timestamp: string;
      sign: string;
    };
    expect(body.msg_type).toBe("text");
    expect(body.timestamp).toBe("1710000000");
    expect(body.content.text).toContain("[critical] Checkout API latency high");
    expect(body.content.text).toContain("Status: firing");
    await expect(createFeishuSign(body.timestamp, "secret")).resolves.toBe(body.sign);
    expect(result.renderedPayload).toEqual({
      msg_type: "text",
      content: {
        text: expect.stringContaining("[critical] Checkout API latency high"),
      },
    });
    expect(JSON.stringify(result.renderedPayload)).not.toContain("secret");
    expect(result.renderedPayload).not.toHaveProperty("timestamp");
    expect(result.renderedPayload).not.toHaveProperty("sign");
  });

  it("renders Feishu interactive card templates without signing fields in rendered payload", async () => {
    const fetcher = fakeFetch(() => ({ body: webhookSuccessBody }));

    const result = await feishuSender.send(
      {
        ...input,
        config: {
          ...input.config,
          template: {
            source: "custom",
            mode: "feishu_card",
            card: {
              header: {
                title: {
                  tag: "plain_text",
                  content: "[{{event.severity}}] {{event.title}}",
                },
              },
              elements: [
                {
                  tag: "div",
                  text: {
                    tag: "lark_md",
                    content: "{{event.message}}\nservice={{event.labels.service}}",
                  },
                },
              ],
            },
          },
        },
      },
      {
        fetch: fetcher,
        now: () => new Date("2024-03-09T16:00:00.000Z"),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.renderedPayload).toEqual({
      msg_type: "interactive",
      card: {
        header: {
          title: {
            tag: "plain_text",
            content: "[critical] Checkout API latency high",
          },
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: "p95 latency exceeded\nservice=checkout",
            },
          },
        ],
      },
    });

    const body = JSON.parse(fetcher.calls[0]?.init.body as string) as {
      msg_type: string;
      timestamp: string;
      sign: string;
    };
    expect(body.msg_type).toBe("interactive");
    expect(body.timestamp).toBe("1710000000");
    expect(result.renderedPayload).not.toHaveProperty("timestamp");
    expect(result.renderedPayload).not.toHaveProperty("sign");
  });

  it("reports template validation failures as non-retryable configuration errors", async () => {
    const fetcher = fakeFetch(() => {
      throw new Error("fetch should not be called");
    });

    const result = await feishuSender.send(
      {
        ...input,
        config: {
          ...input.config,
          template: {
            source: "custom",
            mode: "text",
            text: "{{raw.secret}}",
          },
        },
      },
      { fetch: fetcher },
    );

    expect(result).toMatchObject({
      ok: false,
      errorKind: "configuration_error",
      retryHint: "not_retryable",
      statusCode: null,
      responseBody: null,
      renderedPayload: {
        templateError: {
          diagnostics: [
            {
              severity: "error",
              path: "template.text",
              variable: "raw.secret",
            },
          ],
        },
      },
    });
  });

  it("reports Feishu error codes as delivery failures", async () => {
    // The custom-bot webhook answers a rejection with HTTP 200 plus a body code;
    // the platform's own `msg` is the actionable part and must survive.
    const fetcher = fakeFetch(() => ({
      body: JSON.stringify({ code: 19024, msg: "invalid sign" }),
    }));

    const result = await feishuSender.send(input, { fetch: fetcher });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      errorKind: "target_rejected",
      retryHint: "not_retryable",
      errorMessage: "Feishu returned code 19024: invalid sign",
    });
  });

  it("adds the HTTP status to a webhook failure the body cannot explain", async () => {
    const fetcher = fakeFetch(() => ({ ok: false, status: 502, body: "Bad Gateway" }));

    const result = await feishuSender.send(input, { fetch: fetcher });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "http_error",
      retryHint: "retryable",
      errorMessage: "Feishu webhook returned HTTP 502",
    });
  });

  it("retries a custom group bot send that Feishu rate limited", async () => {
    // Documented for custom bots: 100 次/分钟、5 次/秒, and the platform surfaces
    // the burst as body code 11232 with an otherwise successful HTTP response.
    const fetcher = fakeFetch(() => ({
      body: JSON.stringify({ code: 11232, msg: "create message trigger rate limit" }),
    }));

    const result = await feishuSender.send(input, { fetch: fetcher });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "retryable",
    });
  });
  it("creates signatures with Feishu's timestamp and secret format", () => {
    const expected = "jWsBkWnzlRKtaP+iZgwraSojMWik4cJR7aysApQZuoA=";

    return expect(createFeishuSign("1710000000", "secret")).resolves.toBe(expected);
  });

  it("registers Feishu in the default destination registry", () => {
    const adapter = createDefaultDestinationRegistry().get("feishu");

    expect(adapter.manifest.kind).toBe("feishu");
  });
});
