// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PortableConfigForm } from "#/features/configuration/ui/portable-config-form";

vi.mock("#/components/codemirror/json-editor", () => ({
  JsonEditor: Object.assign(() => null, { Skeleton: () => null }),
}));

vi.mock("#/components/codemirror/toml-editor", () => ({
  TomlEditor: Object.assign(() => null, { Skeleton: () => null }),
}));

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

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
`;

function renderForm(props: { value: string; baseline: string; onImport?: () => Promise<unknown> }) {
  return render(
    <PortableConfigForm
      format="toml"
      value={props.value}
      baseline={props.baseline}
      pending={false}
      onChange={vi.fn<(value: string) => void>()}
      onLoadFile={vi.fn<(file: File) => void>()}
      onExport={vi.fn<() => Promise<unknown>>()}
      onImport={props.onImport ?? vi.fn<() => Promise<unknown>>()}
    />,
  );
}

describe("portable config form", () => {
  afterEach(() => {
    cleanup();
  });

  it("hands a picked file to the loader without importing it", () => {
    const onChange = vi.fn<(value: string) => void>();
    const onLoadFile = vi.fn<(file: File) => void>();
    const onImport = vi.fn<(config: string) => Promise<unknown>>();

    render(
      <PortableConfigForm
        format="toml"
        value=""
        baseline=""
        pending={false}
        onChange={onChange}
        onLoadFile={onLoadFile}
        onExport={vi.fn<() => Promise<unknown>>()}
        onImport={onImport}
      />,
    );

    const file = new File(["[settings]\n"], "tocsin.toml", { type: "application/toml" });

    fireEvent.change(screen.getByLabelText("configuration.portableConfig.loadFile"), {
      target: { files: [file] },
    });

    expect(onLoadFile).toHaveBeenCalledWith(file);
    expect(onChange).not.toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("previews added and updated entries before importing", async () => {
    const candidate = baselineToml.replace('name = "Grafana"', 'name = "Grafana Cloud"').concat(`
[[sources]]
id = "src-2"
name = "Alertmanager"
provider = "alertmanager"
enabled = true
`);

    renderForm({ value: candidate, baseline: baselineToml });
    fireEvent.click(screen.getByLabelText("configuration.portableConfig.applyImport"));

    expect(await screen.findByText("configuration.portableConfig.previewTitle")).toBeTruthy();
    expect(screen.getByText(/previewSectionAdded/)).toBeTruthy();
    expect(screen.getByText(/previewSectionUpdated/)).toBeTruthy();
    expect(screen.queryByText(/previewSectionNotListed/)).toBeNull();
  });

  it("spells out entries the file omits as kept", async () => {
    const candidate = `[settings]
schema_version = "tocsin.config.v1"
include_secrets = false
locale = "zh-Hans"
time_zone = "Asia/Shanghai"
raw_payload_retention_days = 30
`;

    renderForm({ value: candidate, baseline: baselineToml });
    fireEvent.click(screen.getByLabelText("configuration.portableConfig.applyImport"));

    expect(
      await screen.findByText("configuration.portableConfig.previewNotListedHint"),
    ).toBeTruthy();
    expect(screen.getByText("configuration.portableConfig.previewNoChanges")).toBeTruthy();
  });

  it("blocks an import whose editor contents do not parse", async () => {
    renderForm({ value: "[settings", baseline: baselineToml });
    fireEvent.click(screen.getByLabelText("configuration.portableConfig.applyImport"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    const confirm = screen.getByRole("button", {
      name: "configuration.portableConfig.confirmImport",
    });

    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows an import when no baseline is available", async () => {
    renderForm({ value: baselineToml, baseline: "" });
    fireEvent.click(screen.getByLabelText("configuration.portableConfig.applyImport"));

    const confirm = screen.getByRole("button", {
      name: "configuration.portableConfig.confirmImport",
    });

    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
