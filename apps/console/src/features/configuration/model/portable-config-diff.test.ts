import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vite-plus/test";

import { tomlDocumentToConfiguration } from "@tocsin/core";

import {
  diffConfigurations,
  previewPortableConfigChange,
  type PortableConfigPreview,
} from "#/features/configuration/model/portable-config-diff";

const baselineToml = `
[settings]
schema_version = "tocsin.config.v1"
include_secrets = false
locale = "zh-Hans"
time_zone = "Asia/Shanghai"
raw_payload_retention_days = 30

[[sources]]
id = "src-1"
name = "Grafana"
provider = "grafana"
enabled = true

[[sources]]
id = "src-2"
name = "Uptime Kuma"
provider = "uptime_kuma"
enabled = true
`;

function expectOk(preview: PortableConfigPreview) {
  expect(preview.status).toBe("ok");

  if (preview.status !== "ok") {
    throw new Error(`expected an ok preview, got ${preview.status}`);
  }

  return preview.diff;
}

describe("portable config diff", () => {
  it("classifies added, updated, unchanged, and not-listed entities", () => {
    const candidate = baselineToml.replace('name = "Grafana"', 'name = "Grafana Cloud"').concat(`
[[sources]]
id = "src-3"
name = "Alertmanager"
provider = "alertmanager"
enabled = true
`);

    const diff = expectOk(previewPortableConfigChange("toml", candidate, baselineToml));

    expect(diff.sources.added).toEqual([{ id: "src-3", name: "Alertmanager" }]);
    expect(diff.sources.updated).toEqual([{ id: "src-1", name: "Grafana Cloud" }]);
    expect(diff.sources.unchangedCount).toBe(1);
    expect(diff.sources.notListed).toEqual([]);
    expect(diff.settingsChanged).toBe(false);
    expect(diff.hasChanges).toBe(true);
  });

  it("reports entities the file omits as kept instead of deleted", () => {
    const candidate = baselineToml.split("[[sources]]")[0] ?? "";

    const diff = expectOk(previewPortableConfigChange("toml", candidate, baselineToml));

    expect(diff.sources.notListed).toEqual([
      { id: "src-1", name: "Grafana" },
      { id: "src-2", name: "Uptime Kuma" },
    ]);
    expect(diff.notListedCount).toBe(2);
    expect(diff.hasChanges).toBe(false);
  });

  it("does not treat reordered JSON keys as an update", () => {
    const document = {
      settings: {
        schema_version: "tocsin.config.v1",
        include_secrets: false,
        locale: "zh-Hans",
        time_zone: "Asia/Shanghai",
        raw_payload_retention_days: 30,
      },
      sources: [
        {
          id: "src-1",
          name: "Grafana",
          provider: "grafana",
          enabled: true,
          config: { url: "https://grafana.example.test", token_ref: "GRAFANA_TOKEN" },
        },
      ],
    };
    const reorderedDocument = {
      settings: document.settings,
      sources: document.sources.map((source) => ({
        enabled: source.enabled,
        provider: source.provider,
        name: source.name,
        id: source.id,
        config: { token_ref: source.config.token_ref, url: source.config.url },
      })),
    };

    const diff = expectOk(
      previewPortableConfigChange(
        "json",
        JSON.stringify(reorderedDocument),
        JSON.stringify(document),
      ),
    );

    expect(diff.sources.unchangedCount).toBe(1);
    expect(diff.sources.updated).toEqual([]);
  });

  it("flags changed basic settings", () => {
    const candidate = baselineToml.replace(
      "raw_payload_retention_days = 30",
      "raw_payload_retention_days = 7",
    );

    const diff = expectOk(previewPortableConfigChange("toml", candidate, baselineToml));

    expect(diff.settingsChanged).toBe(true);
    expect(diff.sources.unchangedCount).toBe(2);
    expect(diff.hasChanges).toBe(true);
  });

  it("returns a compact parse failure instead of throwing", () => {
    const preview = previewPortableConfigChange("toml", "[settings", baselineToml);

    expect(preview.status).toBe("unparsable");
  });

  it("skips the preview when no baseline is available", () => {
    expect(previewPortableConfigChange("toml", baselineToml, "").status).toBe("no-baseline");
    expect(previewPortableConfigChange("toml", baselineToml, "not a config").status).toBe(
      "no-baseline",
    );
  });

  it("compares parsed configurations directly", () => {
    const baseline = tomlDocumentToConfiguration(parseToml(baselineToml));
    const candidate = tomlDocumentToConfiguration(
      parseToml(baselineToml.replace('name = "Uptime Kuma"', 'name = "Kuma"')),
    );

    const diff = diffConfigurations(baseline, candidate);

    expect(diff.sources.updated).toEqual([{ id: "src-2", name: "Kuma" }]);
    expect(diff.addedCount).toBe(0);
    expect(diff.updatedCount).toBe(1);
  });
});
