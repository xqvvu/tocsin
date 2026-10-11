import { describe, expect, it } from "vite-plus/test";

import type { FeishuApp } from "@tocsin/core";

import {
  createPortableConfiguration,
  parsePortableConfigurationToml,
  resolveFeishuAppSecretRefs,
  serializePortableConfigurationToml,
} from "#/server/configuration/config-portability";
import { DomainValidationError } from "#/server/runtime/domain-errors";

const NOW = "2026-10-08T10:00:00.000Z";
const APP_ENV = "TOCSIN_FEISHU_APP_APP_1_APPSECRET";
const settings = {
  locale: "zh-Hans" as const,
  timeZone: "Asia/Shanghai",
  rawPayloadRetentionDays: 14,
};
const app: FeishuApp = {
  id: "app-1",
  name: "SRE pager",
  appId: "cli_sre",
  appSecret: "secret-1",
  createdAt: NOW,
  updatedAt: NOW,
};

describe("Feishu app portability", () => {
  it("exports apps without the secret and resolves it from the environment on import", () => {
    const portable = createPortableConfiguration(
      { feishuApps: [app], sources: [], destinations: [], routes: [], settings },
      { now: () => NOW },
    );

    expect(portable.feishuApps).toEqual([
      {
        id: "app-1",
        name: "SRE pager",
        appId: "cli_sre",
        secretRefs: {
          appSecret: {
            env: APP_ENV,
          },
        },
      },
    ]);

    const toml = serializePortableConfigurationToml(portable);

    expect(toml).toContain("[[feishu_apps]]");
    expect(toml).toContain(`env = "${APP_ENV}"`);
    expect(toml).not.toContain("secret-1");

    const parsed = parsePortableConfigurationToml(toml);
    const resolved = resolveFeishuAppSecretRefs(parsed.feishuApps[0]!, {
      env: { [APP_ENV]: "secret-from-env" },
    });

    expect(resolved).toEqual({
      id: "app-1",
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-from-env",
    });
  });

  it("fails with a readable error when the secret environment variable is missing", () => {
    const portable = createPortableConfiguration(
      { feishuApps: [app], sources: [], destinations: [], routes: [], settings },
      { now: () => NOW },
    );
    const parsed = parsePortableConfigurationToml(serializePortableConfigurationToml(portable));

    expect(() => resolveFeishuAppSecretRefs(parsed.feishuApps[0]!, { env: {} })).toThrow(
      DomainValidationError,
    );
    expect(() => resolveFeishuAppSecretRefs(parsed.feishuApps[0]!, { env: {} })).toThrow(APP_ENV);
  });

  it("still imports documents without the feishu_apps block", () => {
    const toml = [
      "[settings]",
      'schema_version = "tocsin.config.v1"',
      "include_secrets = false",
      'locale = "en-US"',
      'time_zone = "UTC"',
      "raw_payload_retention_days = 30",
      "",
    ].join("\n");

    expect(parsePortableConfigurationToml(toml).feishuApps).toEqual([]);
  });
});
