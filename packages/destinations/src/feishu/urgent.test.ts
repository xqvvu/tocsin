import type { JsonObject } from "@tocsin/core";
import { describe, expect, it } from "vite-plus/test";

import { feishuUrgentPagingReceivers } from "#destinations/feishu/urgent";

const appConfig = {
  sendMode: "app",
  app: { appRef: "app-1", chatId: "chat-1" },
  urgent: {
    autoEnabled: true,
    severities: ["critical"],
    receivers: ["ou_oncall", "ou_backup"],
  },
};

function receivers(config: JsonObject, status = "firing", severity = "critical") {
  return feishuUrgentPagingReceivers({
    config,
    status: status as "firing" | "resolved" | "unknown",
    severity: severity as "critical" | "warning" | "info" | "unknown",
  });
}

describe("feishu urgent paging gate", () => {
  it("returns every receiver for a firing alert at a gated severity", () => {
    expect(receivers(appConfig)).toEqual(["ou_oncall", "ou_backup"]);
  });

  it("pages nobody when automatic paging is disabled", () => {
    expect(
      receivers({
        ...appConfig,
        urgent: { ...appConfig.urgent, autoEnabled: false },
      }),
    ).toEqual([]);
  });

  it("pages nobody for a non-firing alert", () => {
    expect(receivers(appConfig, "resolved")).toEqual([]);
  });

  it("pages nobody outside the severity gate", () => {
    expect(receivers(appConfig, "firing", "warning")).toEqual([]);
  });

  it("treats an empty severity list as the critical gate, not every severity", () => {
    const emptyGate = {
      ...appConfig,
      urgent: { ...appConfig.urgent, severities: [] },
    };

    expect(receivers(emptyGate, "firing", "critical")).toEqual(["ou_oncall", "ou_backup"]);
    expect(receivers(emptyGate, "firing", "warning")).toEqual([]);
  });

  it("pages nobody in webhook mode, even when an urgent block was imported", () => {
    expect(
      receivers({
        sendMode: "webhook",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/abc",
        urgent: appConfig.urgent,
      }),
    ).toEqual([]);
  });

  it("pages nobody when the stored config does not parse", () => {
    expect(receivers({ sendMode: "app" })).toEqual([]);
  });
});
