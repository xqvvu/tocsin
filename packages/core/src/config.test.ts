import { describe, expect, it } from "vite-plus/test";

import {
  TomlDocumentSchema,
  configurationToTomlDocument,
  tomlDocumentToConfiguration,
  type Configuration,
} from "#core/config";

const portableConfig: Configuration = {
  settings: {
    schemaVersion: "tocsin.config.v1",
    exportedAt: "2026-06-09T08:00:00.000Z",
    includeSecrets: false,
    locale: "zh-Hans",
    timeZone: "Asia/Shanghai",
    rawPayloadRetentionDays: 14,
  },
  feishuApps: [
    {
      id: "feishu-app-sre",
      name: "SRE pager app",
      appId: "cli_sre_app",
      secretRefs: {
        appSecret: {
          env: "FEISHU_APP_SECRET",
        },
      },
    },
  ],
  sources: [
    {
      id: "source-grafana",
      name: "Grafana prod",
      provider: "grafana",
      enabled: true,
      config: {
        team: "sre",
      },
      secretRefs: {},
    },
  ],
  destinations: [
    {
      id: "destination-slack",
      name: "Slack SRE",
      kind: "slack",
      enabled: true,
      config: {},
      secretRefs: {
        webhookUrl: {
          env: "SLACK_WEBHOOK_URL",
        },
      },
    },
  ],
  routes: [
    {
      id: "route-critical",
      name: "Critical alerts",
      enabled: true,
      rule: {
        sourceIds: ["source-grafana"],
        severities: ["critical"],
        statuses: ["firing"],
        labels: [{ key: "service", operator: "equals", value: "api" }],
        titleContains: ["Latency"],
        messageContains: ["timeout"],
      },
      destinationIds: ["destination-slack"],
    },
  ],
};

describe("Tocsin portable configuration", () => {
  it("maps portable config to TOML document keys and back", () => {
    const document = configurationToTomlDocument(portableConfig);

    expect(document).toMatchObject({
      settings: {
        schema_version: "tocsin.config.v1",
        include_secrets: false,
        locale: "zh-Hans",
        time_zone: "Asia/Shanghai",
        raw_payload_retention_days: 14,
      },
      feishu_apps: [
        {
          id: "feishu-app-sre",
          app_id: "cli_sre_app",
          secret_refs: {
            appSecret: {
              env: "FEISHU_APP_SECRET",
            },
          },
        },
      ],
      routes: [
        {
          destination_ids: ["destination-slack"],
          rule: {
            source_ids: ["source-grafana"],
            title_contains: ["Latency"],
            message_contains: ["timeout"],
          },
        },
      ],
    });
    expect(tomlDocumentToConfiguration(document)).toEqual(portableConfig);
  });

  it("rejects unknown TOML document keys", () => {
    expect(() =>
      tomlDocumentToConfiguration({
        settings: {
          schema_version: "tocsin.config.v1",
          include_secrets: false,
          raw_payload_retention_days: 14,
          unknown: true,
        },
      }),
    ).toThrow("Unrecognized key");
  });

  it("rejects unknown provider, destination kind, route rule, and invalid secret refs", () => {
    expect(() =>
      TomlDocumentSchema.parse({
        settings: {
          schema_version: "tocsin.config.v1",
          include_secrets: false,
          raw_payload_retention_days: 14,
        },
        sources: [
          {
            id: "source-unknown",
            name: "Unknown",
            provider: "pagerduty",
            enabled: true,
          },
        ],
      }),
    ).toThrow("Invalid option");

    expect(() =>
      TomlDocumentSchema.parse({
        settings: {
          schema_version: "tocsin.config.v1",
          include_secrets: false,
          raw_payload_retention_days: 14,
        },
        destinations: [
          {
            id: "destination-unknown",
            name: "Unknown",
            kind: "sms",
            enabled: true,
          },
        ],
      }),
    ).toThrow("Invalid option");

    expect(() =>
      TomlDocumentSchema.parse({
        settings: {
          schema_version: "tocsin.config.v1",
          include_secrets: false,
          raw_payload_retention_days: 14,
        },
        routes: [
          {
            id: "route-unknown-rule",
            name: "Unknown route rule",
            enabled: true,
            destination_ids: ["destination-slack"],
            rule: {
              fingerprint_equals: ["alert-1"],
            },
          },
        ],
      }),
    ).toThrow("Unrecognized key");

    expect(() =>
      TomlDocumentSchema.parse({
        settings: {
          schema_version: "tocsin.config.v1",
          include_secrets: false,
          raw_payload_retention_days: 14,
        },
        destinations: [
          {
            id: "destination-invalid-ref",
            name: "Invalid ref",
            kind: "slack",
            enabled: true,
            secret_refs: {
              webhookUrl: {
                env: "not valid",
              },
            },
          },
        ],
      }),
    ).toThrow("Secret environment references must be valid env names");

    expect(() =>
      TomlDocumentSchema.parse({
        settings: {
          schema_version: "tocsin.config.v1",
          include_secrets: false,
          raw_payload_retention_days: 14,
        },
        destinations: [
          {
            id: "destination-unsafe-ref",
            name: "Unsafe ref",
            kind: "slack",
            enabled: true,
            secret_refs: {
              "__proto__.polluted": {
                env: "SLACK_WEBHOOK_URL",
              },
            },
          },
        ],
      }),
    ).toThrow("Secret reference paths must not use prototype-polluting keys");

    expect(() =>
      TomlDocumentSchema.parse({
        settings: {
          schema_version: "tocsin.config.v1",
          include_secrets: false,
          raw_payload_retention_days: 14,
        },
        sources: [
          {
            id: "source-unsafe-ref",
            name: "Unsafe source ref",
            provider: "generic",
            enabled: true,
            secret_refs: {
              "__proto__.polluted": {
                env: "SOURCE_SECRET",
              },
            },
          },
        ],
      }),
    ).toThrow("Secret reference paths must not use prototype-polluting keys");
  });
});
