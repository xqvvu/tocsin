import { describe, expect, it } from "vite-plus/test";

import { DestinationKindSchema } from "@tocsin/core";
import type { DestinationKind, JsonObject } from "@tocsin/core";

import {
  destinationEditorFormDraftFromRuntime,
  destinationListItemFromRuntime,
  destinationMetadataFromRuntime,
} from "#/infra/sqlite/repositories/destination/destination.helpers";
import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";

/**
 * One stored config per destination kind for the read-projection suite. Keyed
 * by kind so a new adapter fails typecheck until its projection case exists;
 * `secrets` are the plaintext values that must never reach a list row, delivery
 * metadata, or SSR data. Webhook path tokens that operators intentionally see
 * (Slack/Feishu addresses) are covered by SEC-26 separately and stay out of
 * these assertions so this fixture does not lock in either side.
 */
const readProjectionCases: Record<
  DestinationKind,
  { config: JsonObject; expectedEndpoint: string; secrets: string[] }
> = {
  generic_webhook: {
    config: {
      url: "https://ops:generic-url-secret@hooks.example.test/ingest",
      method: "PUT",
      headers: { Authorization: "generic-header-secret" },
    },
    expectedEndpoint: "https://ops@hooks.example.test/ingest",
    secrets: ["generic-url-secret", "generic-header-secret"],
  },
  feishu: {
    config: {
      sendMode: "webhook",
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/feishu-path-token",
      signSecret: "feishu-sign-secret",
    },
    expectedEndpoint: "https://open.feishu.cn/open-apis/bot/v2/hook/feishu-path-token",
    secrets: ["feishu-sign-secret"],
  },
  slack: {
    config: { webhookUrl: "https://hooks.slack.com/services/slack-path-token" },
    expectedEndpoint: "https://hooks.slack.com/services/slack-path-token",
    secrets: [],
  },
  email: {
    config: {
      endpointUrl: "https://mailer:email-url-secret@mail.example.test/send",
      to: ["sre@example.test"],
      from: "tocsin@example.test",
      subjectPrefix: "[Tocsin]",
      headers: { "X-Auth-Token": "email-header-secret" },
    },
    expectedEndpoint: "https://mailer@mail.example.test/send",
    secrets: ["email-url-secret", "email-header-secret"],
  },
};

function destinationForKind(kind: DestinationKind, config: JsonObject): DestinationRuntimeConfig {
  return {
    id: `destination-${kind}`,
    name: `${kind} destination`,
    kind,
    enabled: true,
    config,
    secretRefs: {},
  };
}

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
  it("keeps secrets out of the list projection for every destination kind", () => {
    for (const kind of DestinationKindSchema.options) {
      const fixture = readProjectionCases[kind];
      const listItem = destinationListItemFromRuntime(destinationForKind(kind, fixture.config));

      expect({ kind, endpoint: listItem.operationalConfig.endpoint }).toEqual({
        kind,
        endpoint: fixture.expectedEndpoint,
      });
      expect(listItem.operationalConfig.host).toBe(new URL(fixture.expectedEndpoint).host);

      const serialized = JSON.stringify(listItem);
      for (const secret of fixture.secrets) {
        expect({ kind, secret, leaked: serialized.includes(secret) }).toEqual({
          kind,
          secret,
          leaked: false,
        });
      }
    }
  });

  it("keeps secrets out of delivery metadata for every destination kind", () => {
    for (const kind of DestinationKindSchema.options) {
      const fixture = readProjectionCases[kind];
      const metadata = destinationMetadataFromRuntime(destinationForKind(kind, fixture.config));

      expect(metadata.endpoint).toBe(fixture.expectedEndpoint);

      const serialized = JSON.stringify(metadata);
      for (const secret of fixture.secrets) {
        expect({ kind, secret, leaked: serialized.includes(secret) }).toEqual({
          kind,
          secret,
          leaked: false,
        });
      }
    }
  });

  it("keeps the stored URL password in the editor draft for URL-based kinds", () => {
    const genericDraft = destinationEditorFormDraftFromRuntime(
      destinationForKind("generic_webhook", readProjectionCases.generic_webhook.config),
    );
    const emailDraft = destinationEditorFormDraftFromRuntime(
      destinationForKind("email", readProjectionCases.email.config),
    );

    expect(genericDraft.webhookUrl).toBe(
      "https://ops:generic-url-secret@hooks.example.test/ingest",
    );
    expect(emailDraft.endpointUrl).toBe("https://mailer:email-url-secret@mail.example.test/send");
  });

  it("keeps the stored URL string in the editor draft for webhook kinds", () => {
    for (const kind of ["feishu", "slack"] as const) {
      const draft = destinationEditorFormDraftFromRuntime(
        destinationForKind(kind, readProjectionCases[kind].config),
      );

      expect({ kind, url: draft.webhookUrl }).toEqual({
        kind,
        url: readProjectionCases[kind].expectedEndpoint,
      });
    }
  });

  it("reads the generic webhook idempotency opt-in into the editor draft", () => {
    const enabled = destinationEditorFormDraftFromRuntime(
      genericWebhookDestination({
        url: "https://hooks.example.test/ingest",
        idempotencyKey: true,
      }),
    );
    const legacy = destinationEditorFormDraftFromRuntime(
      genericWebhookDestination({ url: "https://hooks.example.test/ingest" }),
    );

    expect(enabled.idempotencyKey).toBe(true);
    // Configs saved before the opt-in existed have no key; the schema default
    // is off, so the editor must render off rather than reject the draft.
    expect(legacy.idempotencyKey).toBe(false);
  });

  it("leaves a URL without credentials untouched", () => {
    const destination = genericWebhookDestination({ url: "https://hooks.example.test/ingest" });

    expect(destinationListItemFromRuntime(destination).operationalConfig.endpoint).toBe(
      "https://hooks.example.test/ingest",
    );
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

function genericWebhookDestination(config: Record<string, unknown>): DestinationRuntimeConfig {
  return {
    id: "destination-2",
    name: "Ops webhook",
    kind: "generic_webhook",
    enabled: true,
    config: config as DestinationRuntimeConfig["config"],
    secretRefs: {},
  };
}
