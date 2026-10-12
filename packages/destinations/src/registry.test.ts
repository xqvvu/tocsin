import type { AdapterConfigField, AdapterSecretField, DestinationKind } from "@tocsin/core";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { createDefaultDestinationRegistry, DestinationRegistry } from "#destinations/registry";
import type { DestinationAdapter } from "#destinations/types";

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

describe("destination registry audit", () => {
  it("audits the default adapter registry without warnings", () => {
    expect(createDefaultDestinationRegistry().audit()).toEqual({ warnings: [] });
  });

  it("flags every core kind the registry does not register", () => {
    expect(new DestinationRegistry().audit().warnings).toEqual([
      "Destination kind is missing from registry: generic_webhook",
      "Destination kind is missing from registry: feishu",
      "Destination kind is missing from registry: slack",
      "Destination kind is missing from registry: email",
    ]);
  });

  it("flags a sensitive config field without a matching secret field", () => {
    const registry = registryWithAdapter(
      stubAdapter({
        configFields: [
          {
            type: "url",
            path: "webhookUrl",
            labelKey: "destinations.form.slackWebhookUrl",
            sensitive: true,
          },
        ],
        secretFields: [],
        configSchema: z.strictObject({ webhookUrl: z.url() }),
      }),
    );

    // Without this rule a kind can ship a secret input the server-side
    // redaction boundary has never heard of.
    expect(registry.audit().warnings).toEqual([
      "Destination slack marks sensitive config without secret field: webhookUrl",
    ]);
  });

  it("flags manifest message keys that the message catalogue does not back", () => {
    const registry = registryWithAdapter(
      stubAdapter({
        configFields: [{ type: "text", path: "note", labelKey: "destinations.form.note" }],
        secretFields: [],
        configSchema: z.strictObject({ note: z.string().optional() }),
      }),
    );

    expect(
      registry.audit({ messageKeys: new MessageKeys(["destinations.form.note"]) }).warnings,
    ).toEqual(["Destination slack references missing i18n key: destinations.form.note"]);
  });

  it("flags template mode copy that the message catalogue does not back", () => {
    const registry = registryWithAdapter(
      stubAdapter({
        configFields: [
          {
            type: "template",
            path: "template",
            labelKey: "destinations.form.stubTemplate",
            modes: [
              {
                mode: "blocks",
                labelKey: "destinations.form.stubTemplateModeBlocks",
                help: {
                  labelKey: "destinations.form.stubBlocksHelp",
                  links: [
                    {
                      href: "https://example.test/blocks",
                      labelKey: "destinations.form.stubBlocksDocs",
                    },
                  ],
                },
              },
            ],
          },
        ],
        secretFields: [],
        configSchema: z.strictObject({ template: z.string().optional() }),
      }),
    );

    expect(
      registry.audit({
        messageKeys: new MessageKeys([
          "destinations.form.stubTemplate",
          "destinations.form.stubTemplateModeBlocks",
          "destinations.form.stubBlocksHelp",
          "destinations.form.stubBlocksDocs",
        ]),
      }).warnings,
    ).toEqual([
      "Destination slack references missing i18n key: destinations.form.stubTemplate",
      "Destination slack references missing i18n key: destinations.form.stubTemplateModeBlocks",
      "Destination slack references missing i18n key: destinations.form.stubBlocksHelp",
      "Destination slack references missing i18n key: destinations.form.stubBlocksDocs",
    ]);
  });

  it("flags a defaultValue that disagrees with the config schema default", () => {
    const registry = registryWithAdapter(
      stubAdapter({
        configFields: [
          {
            type: "select",
            path: "method",
            labelKey: "destinations.form.method",
            defaultValue: "POST",
            options: [
              { value: "POST", labelKey: "destinations.form.method.post" },
              { value: "PUT", labelKey: "destinations.form.method.put" },
            ],
          },
        ],
        secretFields: [],
        configSchema: z.strictObject({ method: z.enum(["POST", "PUT"]).default("PUT") }),
      }),
    );

    expect(registry.audit().warnings).toEqual([
      'Destination slack defaultValue "POST" does not match the schema default "PUT": method',
    ]);
  });

  it("flags a defaultValue for a config path the schema requires", () => {
    const registry = registryWithAdapter(
      stubAdapter({
        configFields: [
          {
            type: "url",
            path: "url",
            labelKey: "destinations.form.webhookUrl",
            defaultValue: "https://example.test/hook",
          },
        ],
        secretFields: [],
        configSchema: z.strictObject({ url: z.url() }),
      }),
    );

    expect(registry.audit().warnings).toEqual([
      'Destination slack declares defaultValue "https://example.test/hook" for a config path its schema requires: url',
    ]);
  });

  it("flags a defaultValue for a config path outside the config schema", () => {
    const registry = registryWithAdapter(
      stubAdapter({
        configFields: [
          {
            type: "text",
            path: "retiredNote",
            labelKey: "destinations.form.retiredNote",
            defaultValue: "note",
          },
        ],
        secretFields: [],
        configSchema: z.strictObject({ note: z.string().optional() }),
      }),
    );

    expect(registry.audit().warnings).toEqual([
      "Destination slack declares a defaultValue for a config path its schema does not define: retiredNote",
    ]);
  });

  it("reads defaults through optional nested config paths", () => {
    const registry = registryWithAdapter(
      stubAdapter({
        configFields: [
          {
            type: "select",
            path: "app.mode",
            labelKey: "destinations.form.appMode",
            defaultValue: "webhook",
            options: [{ value: "webhook", labelKey: "destinations.form.appModeWebhook" }],
          },
        ],
        secretFields: [],
        configSchema: z.strictObject({
          app: z.strictObject({ mode: z.enum(["webhook", "app"]).default("webhook") }).optional(),
        }),
      }),
    );

    expect(registry.audit().warnings).toEqual([]);
  });
});

/**
 * Registers one stand-in adapter for its kind next to the three real default
 * adapters, so a single audit rule can be exercised without touching the
 * shipped manifests.
 */
function registryWithAdapter(adapter: DestinationAdapter): DestinationRegistry {
  const registry = new DestinationRegistry();

  for (const existing of createDefaultDestinationRegistry().list) {
    if (existing.manifest.kind !== adapter.manifest.kind) {
      registry.register(existing);
    }
  }

  registry.register(adapter);

  return registry;
}

function stubAdapter(input: {
  kind?: DestinationKind;
  configFields: AdapterConfigField[];
  secretFields: AdapterSecretField[];
  configSchema: z.ZodType;
}): DestinationAdapter {
  const kind = input.kind ?? "slack";

  return {
    manifest: {
      kind,
      configVersion: 1,
      lifecycle: { status: "stable" },
      displayNameKey: "destinations.kinds.slack",
      configFields: input.configFields,
      secretFields: input.secretFields,
      capabilities: { preview: true, test: true, delivery: true },
    },
    configSchema: input.configSchema,
    preview: () => ({}),
    send: async () => ({
      ok: true,
      statusCode: null,
      responseBody: null,
      renderedPayload: {},
    }),
  };
}

/**
 * Stand-in message catalogue that backs every key except the listed ones, so a
 * missing-key assertion stays focused on the adapter under test.
 */
class MessageKeys extends Set<string> {
  readonly #missing: readonly string[];

  constructor(missing: readonly string[]) {
    super();
    this.#missing = missing;
  }

  override has(key: string): boolean {
    return !this.#missing.includes(key);
  }
}
