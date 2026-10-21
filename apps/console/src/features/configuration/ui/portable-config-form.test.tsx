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
});
