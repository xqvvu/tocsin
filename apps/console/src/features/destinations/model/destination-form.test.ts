import { describe, expect, it } from "vite-plus/test";

import {
  applyDynamicStatusColor,
  canApplyDynamicStatusColor,
  destinationTemplateFormStateFromDraft,
  destinationConfigPatchFromForm,
  destinationConfigFromForm,
  destinationTemplateBodyFormField,
  isDestinationTemplateBodyDraft,
  isDestinationTemplateFormMode,
  formDestinationKind,
  formDestinationKindValue,
} from "#/features/destinations/model/destination-form";

describe("destination form helpers", () => {
  it("maps generic webhook method, headers, and template fields into destination config", () => {
    const data = new FormData();

    data.set("kind", "generic_webhook");
    data.set("url", "https://relay.example.test/tocsin");
    data.set("method", "PATCH");
    data.set("headers", "Authorization: Bearer relay-secret\nX-Team: sre\ninvalid");
    data.set("templateText", "{{event.title}} from {{source.name}}");

    expect(formDestinationKind(data)).toBe("generic_webhook");
    expect(destinationConfigFromForm("generic_webhook", data)).toEqual({
      url: "https://relay.example.test/tocsin",
      method: "PATCH",
      headers: {
        Authorization: "Bearer relay-secret",
        "X-Team": "sre",
      },
      template: {
        mode: "text",
        text: "{{event.title}} from {{source.name}}",
      },
    });
  });

  it("maps email recipients, reply-to, headers, and template fields into destination config", () => {
    const data = new FormData();

    data.set("kind", "email");
    data.set("endpointUrl", "https://mail.example.test/send");
    data.set("to", "sre@example.test, audit@example.test\nops@example.test");
    data.set("from", "tocsin@example.test");
    data.set("replyTo", "ops@example.test");
    data.set("subjectPrefix", "[Tocsin]");
    data.set("headers", "Authorization: Bearer gateway-secret\nX-Mailer: Tocsin");
    data.set("templateText", "{{event.message}}");

    expect(formDestinationKind(data)).toBe("email");
    expect(destinationConfigFromForm("email", data)).toEqual({
      endpointUrl: "https://mail.example.test/send",
      to: ["sre@example.test", "audit@example.test", "ops@example.test"],
      from: "tocsin@example.test",
      replyTo: "ops@example.test",
      subjectPrefix: "[Tocsin]",
      headers: {
        Authorization: "Bearer gateway-secret",
        "X-Mailer": "Tocsin",
      },
      template: {
        mode: "text",
        text: "{{event.message}}",
      },
    });
  });

  it("maps Feishu card templates into destination config", () => {
    const data = new FormData();

    data.set("kind", "feishu");
    data.set("webhookUrl", "https://open.feishu.cn/webhook");
    data.set("signSecret", "feishu-sign-secret");
    data.set("templateSource", "custom");
    data.set("templateMode", "feishu_card");
    data.set(
      "templateBindings",
      JSON.stringify({
        statusColor: {
          select: "event.status",
          cases: { firing: "red", resolved: "green", unknown: "grey" },
          fallback: "grey",
        },
      }),
    );
    data.set(
      "templateCard",
      JSON.stringify({
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
              content: "{{event.message}}",
            },
          },
        ],
      }),
    );

    expect(destinationConfigFromForm("feishu", data)).toEqual({
      sendMode: "webhook",
      webhookUrl: "https://open.feishu.cn/webhook",
      signSecret: "feishu-sign-secret",
      template: {
        source: "custom",
        mode: "feishu_card",
        bindings: {
          statusColor: {
            select: "event.status",
            cases: { firing: "red", resolved: "green", unknown: "grey" },
            fallback: "grey",
          },
        },
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
                content: "{{event.message}}",
              },
            },
          ],
        },
      },
    });
  });

  it("maps the built-in Feishu card to a stable template reference", () => {
    const data = new FormData();

    data.set("webhookUrl", "https://open.feishu.cn/webhook");
    data.set("templateSource", "builtin");
    data.set("templateBindings", "{}");

    expect(destinationConfigFromForm("feishu", data)).toEqual({
      sendMode: "webhook",
      webhookUrl: "https://open.feishu.cn/webhook",
      template: {
        source: "builtin",
        id: "feishu.alert-card",
        version: 1,
      },
    });
  });

  it("builds destination edit patches without empty secret fields", () => {
    const generic = new FormData();

    generic.set("kind", "generic_webhook");
    generic.set("url", "");
    generic.set("method", "PATCH");
    generic.set("headers", "");
    generic.set("templateText", "{{event.title}} from {{destination.name}}");

    expect(destinationConfigPatchFromForm("generic_webhook", generic)).toEqual({
      method: "PATCH",
      template: {
        mode: "text",
        text: "{{event.title}} from {{destination.name}}",
      },
    });

    const email = new FormData();

    email.set("endpointUrl", "");
    email.set("to", "");
    email.set("from", "");
    email.set("subjectPrefix", "[Tocsin]");

    expect(destinationConfigPatchFromForm("email", email)).toEqual({
      subjectPrefix: "[Tocsin]",
    });

    const feishuCardWithoutDraft = new FormData();

    feishuCardWithoutDraft.set("templateMode", "feishu_card");
    feishuCardWithoutDraft.set("templateCard", "");

    expect(destinationConfigPatchFromForm("feishu", feishuCardWithoutDraft)).toEqual({
      sendMode: "webhook",
    });
  });

  it("maps Feishu app send mode with urgent paging into destination config", () => {
    const data = new FormData();

    data.set("kind", "feishu");
    data.set("sendMode", "app");
    data.set("appRef", "feishu-app-1");
    data.set("chatId", "oc_group");
    data.set("urgentAutoEnabled", "true");
    data.set("urgentSeverities", JSON.stringify(["critical", "warning", "bogus"]));
    data.set("urgentUserIdType", "user_id");
    data.set("urgentReceivers", "ou_1\nou_2, ou_2");
    data.set("templateText", "{{event.title}}");

    expect(destinationConfigFromForm("feishu", data)).toEqual({
      sendMode: "app",
      app: { appRef: "feishu-app-1", chatId: "oc_group" },
      urgent: {
        autoEnabled: true,
        severities: ["critical", "warning"],
        userIdType: "user_id",
        receivers: ["ou_1", "ou_2"],
      },
      template: {
        source: "custom",
        mode: "text",
        text: "{{event.title}}",
      },
    });
  });

  it("omits the urgent block when no receivers are configured", () => {
    const data = new FormData();

    data.set("kind", "feishu");
    data.set("sendMode", "app");
    data.set("appRef", "feishu-app-1");
    data.set("chatId", "oc_group");
    data.set("urgentAutoEnabled", "true");
    data.set("urgentSeverities", JSON.stringify([]));
    data.set("urgentUserIdType", "open_id");
    data.set("urgentReceivers", "");

    const config = destinationConfigFromForm("feishu", data);

    expect(config).not.toHaveProperty("urgent");
    expect(config.app).toEqual({ appRef: "feishu-app-1", chatId: "oc_group" });
  });

  it("falls back unknown destination form kinds to generic webhook", () => {
    expect(formDestinationKindValue("unsupported")).toBe("generic_webhook");
  });

  it("loads a saved binding draft without exposing unrelated config", () => {
    expect(
      destinationTemplateFormStateFromDraft({
        source: "custom",
        mode: "feishu_card",
        bindings: {
          statusColor: {
            select: "event.status",
            cases: { firing: "orange", resolved: "green" },
            fallback: "grey",
          },
        },
        card: {
          header: { template: "{{bindings.statusColor}}" },
        },
      }),
    ).toMatchObject({
      templateSource: "custom",
      templateMode: "feishu_card",
      templateColorEnabled: true,
      templateColorSelector: "event.status",
      templateColorCases: { firing: "orange", resolved: "green" },
      templateColorFallback: "grey",
      templateCard: expect.stringContaining("{{bindings.statusColor}}"),
    });
  });

  it("loads a built-in Feishu reference without persisting the card JSON", () => {
    expect(
      destinationTemplateFormStateFromDraft({
        source: "builtin",
        id: "feishu.alert-card",
        version: 1,
      }),
    ).toMatchObject({
      templateSource: "builtin",
      templateMode: "feishu_card",
      templateCard: expect.stringContaining("{{presentation.labels.summary}}"),
    });
  });

  it("applies dynamic status colors only to recognized card paths", () => {
    const card = JSON.stringify({
      header: {
        template: "red",
        text_tag_list: [
          { text: { content: "{{event.severity}}" }, color: "red" },
          { text: { content: "{{event.status}}" }, color: "orange" },
        ],
      },
      body: {
        color: "red",
      },
    });

    expect(canApplyDynamicStatusColor(card)).toBe(true);

    const applied = JSON.parse(applyDynamicStatusColor(card)) as {
      header: { template: string; text_tag_list: Array<{ color: string }> };
      body: { color: string };
    };

    expect(applied.header.template).toBe("{{bindings.statusColor}}");
    expect(applied.header.text_tag_list[0]?.color).toBe("red");
    expect(applied.header.text_tag_list[1]?.color).toBe("{{bindings.statusColor}}");
    expect(applied.body.color).toBe("red");
  });
});

describe("destination template modes (#47)", () => {
  it("maps a slack_blocks template into config and back out of the draft", () => {
    const data = new FormData();

    data.set("kind", "slack");
    data.set("webhookUrl", "https://hooks.slack.com/services/T/B/x");
    data.set("templateMode", "slack_blocks");
    data.set("templatePayload", '{"blocks":[{"type":"section"}]}');

    expect(destinationConfigFromForm("slack", data)).toMatchObject({
      webhookUrl: "https://hooks.slack.com/services/T/B/x",
      template: {
        mode: "slack_blocks",
        payload: { blocks: [{ type: "section" }] },
      },
    });

    const roundTripped = destinationTemplateFormStateFromDraft({
      mode: "slack_blocks",
      payload: { blocks: [{ type: "section" }] },
    });

    expect(roundTripped.templateMode).toBe("slack_blocks");
    expect(JSON.parse(roundTripped.templatePayload)).toEqual({
      blocks: [{ type: "section" }],
    });
  });

  it("maps a json_payload template into config", () => {
    const data = new FormData();

    data.set("kind", "generic_webhook");
    data.set("url", "https://relay.example.test/tocsin");
    data.set("templateMode", "json_payload");
    data.set("templatePayload", '{"title":"{{event.title}}"}');

    expect(destinationConfigFromForm("generic_webhook", data)).toMatchObject({
      template: {
        mode: "json_payload",
        payload: { title: "{{event.title}}" },
      },
    });
  });

  it("keeps each mode's body separate so switching modes does not leak drafts", () => {
    const draft = destinationTemplateFormStateFromDraft({
      mode: "slack_blocks",
      payload: { blocks: [] },
      bindings: {},
    });

    expect(JSON.parse(draft.templatePayload)).toEqual({ blocks: [] });
    // A payload body is never copied into the text draft, and the card draft
    // keeps its own default rather than receiving the payload.
    expect(draft.templateText).toBe("");
    expect(JSON.parse(draft.templateCard)).not.toEqual({ blocks: [] });
  });

  it("accepts an object draft or an empty one, and rejects anything else", () => {
    // Empty means "no template", which is valid.
    expect(isDestinationTemplateBodyDraft("")).toBe(true);
    expect(isDestinationTemplateBodyDraft('{"blocks":[]}')).toBe(true);
    // A JSON mode's schema requires an object root, so a half-written or
    // non-object draft must be reported at the form boundary, not at save.
    expect(isDestinationTemplateBodyDraft("[]")).toBe(false);
    expect(isDestinationTemplateBodyDraft("{")).toBe(false);
    expect(isDestinationTemplateBodyDraft('"text"')).toBe(false);
  });

  it("resolves every shared mode to a form mode", () => {
    for (const mode of ["text", "feishu_card", "json_payload", "slack_blocks"] as const) {
      expect(isDestinationTemplateFormMode(mode)).toBe(true);
      expect(destinationTemplateBodyFormField(mode)).toMatch(/^template/);
    }

    expect(isDestinationTemplateFormMode("email_html")).toBe(false);
  });
});
