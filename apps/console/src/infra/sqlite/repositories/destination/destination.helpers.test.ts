import { describe, expect, it } from "vite-plus/test";

import {
  destinationEditorFormDraftFromRuntime,
  destinationMetadataFromRuntime,
} from "#/infra/sqlite/repositories/destination/destination.helpers";
import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";

describe("destinationMetadataFromRuntime", () => {
  it("projects every automatic paging gate for a Feishu app destination", () => {
    const metadata = destinationMetadataFromRuntime(
      feishuDestination({
        sendMode: "app",
        app: { appRef: "oncall-bot", chatId: "oc_123" },
        urgent: {
          autoEnabled: true,
          severities: ["critical", "warning"],
          receivers: ["ou_1", "ou_2"],
        },
      }),
    );

    expect(metadata).toMatchObject({
      sendMode: "app",
      urgentAutoEnabled: true,
      urgentReceiverCount: 2,
      urgentSeverities: ["critical", "warning"],
    });
  });

  it("mirrors the schema default when the urgent block omits severities", () => {
    const metadata = destinationMetadataFromRuntime(
      feishuDestination({
        sendMode: "app",
        app: { appRef: "oncall-bot", chatId: "oc_123" },
        urgent: { autoEnabled: true, receivers: ["ou_1"] },
      }),
    );

    expect(metadata.urgentSeverities).toEqual(["critical"]);
  });

  it("treats an explicit empty severity list as the critical gate", () => {
    const metadata = destinationMetadataFromRuntime(
      feishuDestination({
        sendMode: "app",
        app: { appRef: "oncall-bot", chatId: "oc_123" },
        urgent: { autoEnabled: true, severities: [], receivers: ["ou_1"] },
      }),
    );

    expect(metadata.urgentSeverities).toEqual(["critical"]);
  });

  it("reports no receivers and no severities when the app has no urgent block", () => {
    const metadata = destinationMetadataFromRuntime(
      feishuDestination({
        sendMode: "app",
        app: { appRef: "oncall-bot", chatId: "oc_123" },
      }),
    );

    expect(metadata).toMatchObject({
      sendMode: "app",
      urgentAutoEnabled: false,
      urgentReceiverCount: 0,
      urgentSeverities: [],
    });
  });

  it("leaves urgent fields out of Webhook mode", () => {
    const metadata = destinationMetadataFromRuntime(
      feishuDestination({ sendMode: "webhook", webhookUrl: "https://example.test/hook" }),
    );

    expect(metadata.sendMode).toBeUndefined();
    expect(metadata.urgentAutoEnabled).toBeUndefined();
    expect(metadata.urgentReceiverCount).toBeUndefined();
  });

  it("keeps signing and app secrets out of the metadata", () => {
    const metadata = destinationMetadataFromRuntime(
      feishuDestination({
        sendMode: "app",
        signSecret: "sign-secret-value",
        app: { appRef: "oncall-bot", chatId: "oc_123", appSecret: "app-secret-value" },
        urgent: { autoEnabled: true, receivers: ["ou_1"] },
      }),
    );

    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("sign-secret-value");
    expect(serialized).not.toContain("app-secret-value");
  });
  it("loads an empty stored severity list as the critical gate in the editor", () => {
    const draft = destinationEditorFormDraftFromRuntime(
      feishuDestination({
        sendMode: "app",
        app: { appRef: "oncall-bot", chatId: "oc_123" },
        urgent: { autoEnabled: true, severities: [], receivers: ["ou_1"] },
      }),
    );

    expect(draft.urgentSeverities).toEqual(["critical"]);
  });
});

function feishuDestination(config: Record<string, unknown>): DestinationRuntimeConfig {
  return {
    id: "destination-1",
    name: "Ops group",
    kind: "feishu",
    enabled: true,
    config: config as DestinationRuntimeConfig["config"],
    secretRefs: {},
  };
}
