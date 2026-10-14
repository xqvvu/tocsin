import { describe, expect, it } from "vite-plus/test";

import { feishuSender, FeishuConfigSchema } from "@tocsin/destinations/feishu";
import { destinationSendInput } from "@tocsin/destinations/test-kit";
import { parseFastgptProvider } from "@tocsin/providers";

const receivedAt = "2026-09-25T07:31:00.000Z";
const model = {
  model: "speech-01-turbo",
  modelId: "6a995e6514161dc586c6cded",
  name: "speech-01-turbo",
  provider: "MiniMax",
  type: "tts",
};

const config = FeishuConfigSchema.parse({
  webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
});

describe("FastGPT → built-in Feishu card", () => {
  it("renders the recovered probe from its parsed payload", async () => {
    const parsed = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT 模型探测",
      receivedAt,
      headers: {},
      payload: {
        event: "model_status_recovered",
        model,
        probe: {
          attempts: 1,
          latencyMs: 295,
          requestEndedAt: "2026-09-25T07:30:07.659Z",
          requestStartedAt: "2026-09-25T07:30:07.364Z",
          startedAt: "2026-09-25T07:30:07.364Z",
        },
        status: "green",
      },
    });
    const preview = await feishuSender.preview(
      destinationSendInput({
        destination: { kind: "feishu", name: "FastGPT 告警" },
        source: { name: "FastGPT 模型探测", provider: "fastgpt" },
        normalizedEvent: parsed.normalized,
        payload: {
          event: "model_status_recovered",
          model,
          probe: { attempts: 1, latencyMs: 295, status: "green" },
        },
        config,
        presentation: { locale: "zh-Hans", timeZone: "Asia/Shanghai" },
      }),
    );
    const serialized = JSON.stringify(preview);

    expect(serialized).toContain("FastGPT 模型探测");
    expect(serialized).toContain("MiniMax · 语音合成");
    expect(serialized).toContain("295 ms");
    expect(serialized).toContain("模型已恢复响应");
    expect(serialized).not.toContain("Uptime Kuma");
    expect(serialized).not.toContain("Check URL");
  });

  it("renders a compact, credential-safe error from its parsed payload", async () => {
    const parsed = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT 模型探测",
      receivedAt,
      headers: {},
      payload: {
        event: "model_status_error",
        model,
        probe: {
          attempts: 4,
          error: '500 {"code":"bad_response","type":"upstream_error","param":"500"}',
          requestEndedAt: "2026-09-25T07:25:10.391Z",
          requestStartedAt: "2026-09-25T07:25:10.363Z",
          startedAt: "2026-09-25T07:25:08.568Z",
        },
        status: "red",
      },
    });
    const preview = await feishuSender.preview(
      destinationSendInput({
        destination: { kind: "feishu", name: "FastGPT 告警" },
        source: { name: "FastGPT 模型探测", provider: "fastgpt" },
        normalizedEvent: parsed.normalized,
        payload: {
          event: "model_status_error",
          model,
          probe: {
            attempts: 4,
            error: '500 {"code":"bad_response","type":"upstream_error","param":"500"}',
            status: "red",
          },
        },
        config,
        presentation: { locale: "zh-Hans", timeZone: "Asia/Shanghai" },
      }),
    );
    const serialized = JSON.stringify(preview);

    expect(serialized).toContain("FastGPT 模型探测");
    expect(serialized).toContain("4");
    expect(serialized).toContain("500 bad_response · upstream_error");
    expect(serialized).toContain("模型探测失败");
    expect(serialized).not.toContain("param");
    expect(serialized).not.toContain("Response time");
    expect(serialized).not.toContain("Uptime Kuma");
  });
});
