import { describe, expect, it } from "vite-plus/test";

import { FeishuConfigSchema, MAX_URGENT_RECEIVERS } from "#destinations/feishu/schema";

const webhookUrl = "https://open.feishu.cn/open-apis/bot/v2/hook/example";
const appTarget = { appRef: "app-1", chatId: "oc_group" };
const urgent = { autoEnabled: true, receivers: ["ou_1"] };

describe("feishu destination config", () => {
  it("defaults to webhook send mode so existing configs stay valid", () => {
    const config = FeishuConfigSchema.parse({ webhookUrl });

    expect(config.sendMode).toBe("webhook");
    expect(config.urgent).toBeUndefined();
    expect(config.app).toBeUndefined();
  });

  it("requires the webhook URL in webhook send mode", () => {
    expect(() => FeishuConfigSchema.parse({ sendMode: "webhook" })).toThrow(
      /webhook URL is required in webhook send mode/,
    );
  });

  it("requires the app target in app send mode", () => {
    expect(() => FeishuConfigSchema.parse({ sendMode: "app" })).toThrow(
      /app target is required in app send mode/,
    );
  });

  it("requires the app reference and chat id together", () => {
    expect(() => FeishuConfigSchema.parse({ sendMode: "app", app: { appRef: "app-1" } })).toThrow(
      /chatId/,
    );
    expect(() =>
      FeishuConfigSchema.parse({ sendMode: "app", app: { chatId: "oc_group" } }),
    ).toThrow(/appRef/);
  });

  it("rejects the urgent block in webhook send mode", () => {
    expect(() => FeishuConfigSchema.parse({ webhookUrl, urgent })).toThrow(
      /urgent phone requires app send mode/,
    );
  });

  it("rejects empty or duplicate urgent receivers", () => {
    expect(() =>
      FeishuConfigSchema.parse({
        sendMode: "app",
        app: appTarget,
        urgent: { autoEnabled: true, receivers: [] },
      }),
    ).toThrow();

    expect(() =>
      FeishuConfigSchema.parse({
        sendMode: "app",
        app: appTarget,
        urgent: { autoEnabled: true, receivers: ["ou_1", "ou_1"] },
      }),
    ).toThrow(/receivers must be unique/);
  });

  it("rejects more urgent receivers than the platform allows per call", () => {
    const receivers = Array.from({ length: MAX_URGENT_RECEIVERS + 1 }, (_, index) => `ou_${index}`);

    expect(() =>
      FeishuConfigSchema.parse({
        sendMode: "app",
        app: appTarget,
        urgent: { autoEnabled: true, receivers },
      }),
    ).toThrow(/cannot exceed 200/);

    expect(
      FeishuConfigSchema.parse({
        sendMode: "app",
        app: appTarget,
        urgent: { autoEnabled: true, receivers: receivers.slice(0, MAX_URGENT_RECEIVERS) },
      }).urgent?.receivers,
    ).toHaveLength(MAX_URGENT_RECEIVERS);
  });
  it("accepts app send mode with urgent configuration and applies its defaults", () => {
    const config = FeishuConfigSchema.parse({
      sendMode: "app",
      app: appTarget,
      urgent,
    });

    expect(config.urgent).toEqual({
      autoEnabled: true,
      severities: ["critical"],
      userIdType: "open_id",
      receivers: ["ou_1"],
    });
  });

  it("normalises an explicit empty severity list to the critical gate", () => {
    const config = FeishuConfigSchema.parse({
      sendMode: "app",
      app: appTarget,
      urgent: { ...urgent, severities: [] },
    });

    expect(config.urgent?.severities).toEqual(["critical"]);
  });

  it("keeps an explicit severity list unchanged", () => {
    const config = FeishuConfigSchema.parse({
      sendMode: "app",
      app: appTarget,
      urgent: { ...urgent, severities: ["critical", "warning"] },
    });

    expect(config.urgent?.severities).toEqual(["critical", "warning"]);
  });

  it("rejects an unknown severity instead of silently dropping it", () => {
    expect(() =>
      FeishuConfigSchema.parse({
        sendMode: "app",
        app: appTarget,
        urgent: { ...urgent, severities: ["critical", "bogus"] },
      }),
    ).toThrow();
  });

  it("keeps a leftover webhook URL in app mode so switching modes is lossless", () => {
    const config = FeishuConfigSchema.parse({
      sendMode: "app",
      webhookUrl,
      app: appTarget,
    });

    expect(config.webhookUrl).toBe(webhookUrl);
  });
});
