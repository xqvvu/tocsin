// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PortableConfigForm } from "#/features/configuration/ui/portable-config-form";
import { AppIntlProvider } from "#/i18n/provider";

// The editors are client-only and load a large bundle; the placeholder is
// resolved while the form renders, so stubbing them keeps the test focused.
vi.mock("#/components/codemirror/json-editor", () => ({
  JsonEditor: Object.assign(() => null, { Skeleton: () => null }),
}));

vi.mock("#/components/codemirror/toml-editor", () => ({
  TomlEditor: Object.assign(() => null, { Skeleton: () => null }),
}));

describe("portable config placeholders", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the JSON sample without parsing it as an ICU message", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppIntlProvider locale="en-US">
        <PortableConfigForm
          format="json"
          value=""
          baseline=""
          pending={false}
          onChange={vi.fn<(value: string) => void>()}
          onLoadFile={vi.fn<(file: File) => void>()}
          onExport={vi.fn<() => Promise<unknown>>()}
          onImport={vi.fn<(config: string) => Promise<unknown>>()}
        />
      </AppIntlProvider>,
    );

    // The sample's braces used to reach the ICU parser, which logged
    // `INVALID_MESSAGE: MALFORMED_ARGUMENT` on every JSON tab render and made
    // the placeholder the only visible symptom. Reading the message raw keeps
    // the console clean.
    expect(consoleError).not.toHaveBeenCalled();
  });
});
