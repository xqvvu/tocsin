import { describe, expect, it } from "vite-plus/test";

import {
  DestinationEditorDraftResultSchema,
  DestinationListItemSchema,
  DestinationOperationalConfigSchema,
  DestinationPreviewResultSchema,
  DestinationTestResultSchema,
} from "#core/destination/destination";

describe("destination dashboard DTOs", () => {
  it("accepts operator-visible endpoints on list items", () => {
    const item = DestinationListItemSchema.parse({
      id: "dest_1",
      name: "Feishu SRE",
      kind: "feishu",
      enabled: true,
      operationalConfig: {
        endpoint: "https://open.feishu.cn/open-apis/bot/v2/hook/private-token",
        host: "open.feishu.cn",
        templateConfigured: true,
        templateMode: "feishu_card",
        templateSource: "builtin",
        signingConfigured: true,
        method: null,
        to: null,
        from: null,
        replyTo: null,
        subjectPrefix: null,
        headerNames: null,
        secretFieldPaths: ["webhookUrl", "signSecret"],
        sendMode: "webhook",
        appRef: null,
        chatId: null,
        urgentAutoEnabled: null,
        urgentReceivers: null,
      },
    });

    expect(item.operationalConfig.endpoint).toContain("open.feishu.cn");
    expect(item.operationalConfig.secretFieldPaths).toContain("signSecret");
  });

  it("requires renderedPayload on test results", () => {
    const result = DestinationTestResultSchema.parse({
      destination: {
        id: "dest_1",
        name: "Webhook",
        kind: "generic_webhook",
        enabled: true,
      },
      success: true,
      statusCode: 202,
      responseBody: "accepted",
      error: null,
      renderedPayload: { text: "preview" },
    });

    expect(result.renderedPayload).toEqual({ text: "preview" });
  });

  it("accepts a structured preview result", () => {
    const preview = DestinationPreviewResultSchema.parse({
      destination: {
        id: "dest_1",
        name: "Webhook",
        kind: "generic_webhook",
        enabled: true,
      },
      renderedPayload: { text: "hello" },
      sample: {
        kind: "built_in",
        eventId: "preview-event",
        source: {
          id: "preview-source",
          name: "Tocsin preview",
          provider: "generic",
          enabled: true,
        },
        receivedAt: null,
      },
      context: {
        event: {
          id: "preview-event",
          title: "t",
          message: "m",
          severity: "info",
          severityDisplay: "Info",
          status: "firing",
          statusDisplay: "Firing",
          fingerprint: "fp",
          occurredAt: "2026-01-01T00:00:00.000Z",
          occurredAtDisplay: "Jan 1, 2026",
          labels: {},
        },
        source: { id: "preview-source", name: "Tocsin preview", provider: "generic" },
        destination: { id: "dest_1", name: "Webhook", kind: "generic_webhook" },
        presentation: {
          locale: "en-US",
          timeZone: "UTC",
          labels: { summary: "Alert summary" },
        },
        tocsin: { eventUrl: "" },
        payload: {},
        bindings: {},
      },
      normalizedEvent: {
        title: "t",
        message: "m",
        severity: "info",
        status: "firing",
        fingerprint: "fp",
        labels: {},
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
      diagnostics: [],
      rawPayloadReference: null,
    });

    expect(preview.sample.kind).toBe("built_in");
  });

  it("editor draft returns form fields without signing secrets", () => {
    const draft = DestinationEditorDraftResultSchema.parse({
      destinationId: "dest_1",
      kind: "feishu",
      template: { source: "builtin", id: "feishu.alert-card", version: 1 },
      operationalConfig: {
        endpoint: "https://open.feishu.cn/open-apis/bot/v2/hook/abc",
        host: "open.feishu.cn",
        method: null,
        to: null,
        from: null,
        replyTo: null,
        subjectPrefix: null,
        headerNames: null,
        templateConfigured: true,
        templateMode: null,
        templateSource: "builtin",
        signingConfigured: true,
        secretFieldPaths: ["webhookUrl", "signSecret"],
        sendMode: "webhook",
        appRef: null,
        chatId: null,
        urgentAutoEnabled: null,
        urgentReceivers: null,
      },
      form: {
        endpointUrl: "",
        to: "",
        from: "",
        replyTo: "",
        subjectPrefix: "",
        subjectTemplate: "",
        htmlTemplate: "",
        headers: "",
        url: "",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/abc",
        method: "",
        idempotencyKey: false,
        sendMode: "webhook",
        appRef: "",
        chatId: "",
        urgentAutoEnabled: true,
        urgentSeverities: ["critical"],
        urgentUserIdType: "open_id",
        urgentReceivers: "",
      },
    });

    expect(draft.form.webhookUrl).toContain("open.feishu.cn");
    // Path names may appear in secretFieldPaths; secret values must not.
    expect(draft.operationalConfig.secretFieldPaths).toContain("signSecret");
    expect(JSON.stringify(draft)).not.toMatch(/"signSecret"\s*:\s*"/);
    expect(JSON.stringify(draft.form)).not.toContain("signSecret");
  });

  it("drops unknown secret-bearing keys from operational config", () => {
    const parsed = DestinationOperationalConfigSchema.parse({
      endpoint: "https://example.test/hook",
      host: "example.test",
      templateConfigured: false,
      templateMode: null,
      templateSource: null,
      signingConfigured: false,
      method: null,
      to: null,
      from: null,
      replyTo: null,
      subjectPrefix: null,
      headerNames: null,
      secretFieldPaths: [],
      sendMode: null,
      appRef: null,
      chatId: null,
      urgentAutoEnabled: null,
      urgentReceivers: null,
      signSecret: "should-not-appear",
    });

    expect(parsed).not.toHaveProperty("signSecret");
    expect(JSON.stringify(parsed)).not.toContain("should-not-appear");
  });
});
