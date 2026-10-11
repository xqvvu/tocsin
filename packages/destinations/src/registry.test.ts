import { describe, expect, it } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "#destinations/registry";

describe("destination registry", () => {
  it("projects adapters to a client-safe catalog", () => {
    const catalog = createDefaultDestinationRegistry().toCatalog();

    expect(catalog.map((item) => item.kind).sort()).toEqual([
      "email",
      "feishu",
      "generic_webhook",
      "slack",
    ]);
    expect(catalog.find((item) => item.kind === "generic_webhook")).toMatchObject({
      kind: "generic_webhook",
      configVersion: 1,
      lifecycle: {
        status: "stable",
      },
      displayNameKey: "destinations.kinds.generic_webhook",
      capabilities: {
        preview: true,
        test: true,
        delivery: true,
      },
    });
    const feishuItem = catalog.find((item) => item.kind === "feishu");

    expect(feishuItem?.configFields.map((field) => field.type)).toEqual([
      "select",
      "url",
      "secret",
      "text",
      "text",
      "boolean",
      "string-list",
      "select",
      "string-list",
      "template",
    ]);
    expect(feishuItem?.configFields.find((field) => field.type === "template")).toMatchObject({
      modes: [
        {
          mode: "text",
          labelKey: "destinations.form.templateModeText",
        },
        {
          mode: "feishu_card",
          labelKey: "destinations.form.templateModeFeishuCard",
          help: {
            labelKey: "destinations.form.feishuCardTemplateHelpLabel",
            descriptionKey: "destinations.form.feishuCardTemplateHelp",
            links: [
              {
                labelKey: "destinations.form.feishuCardJsonDocs",
                href: "https://open.feishu.cn/document/feishu-cards/card-json-structure",
              },
            ],
          },
        },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain("secretFields");
    expect(JSON.stringify(catalog)).not.toContain("configSchema");
    expect(Object.keys(feishuItem ?? {}).sort()).toEqual(
      [
        "kind",
        "configVersion",
        "lifecycle",
        "displayNameKey",
        "descriptionKey",
        "iconName",
        "configFields",
        "capabilities",
      ].sort(),
    );
  });

  it("exposes Slack template modes that match the modes Slack can render", () => {
    const slackItem = createDefaultDestinationRegistry()
      .toCatalog()
      .find((item) => item.kind === "slack");
    const templateField = slackItem?.configFields.find((field) => field.type === "template");

    // The manifest is what the console renders mode controls from; a mode here
    // without a schema/renderer (or the reverse) silently breaks template saving.
    expect(templateField?.modes).toEqual([
      {
        mode: "text",
        labelKey: "destinations.form.templateModeText",
      },
      {
        mode: "slack_blocks",
        labelKey: "destinations.form.templateModeSlackBlocks",
      },
    ]);
  });
});
