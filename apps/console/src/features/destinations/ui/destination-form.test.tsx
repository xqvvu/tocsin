// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createDefaultDestinationRegistry } from "@tocsin/destinations";

import {
  createDestinationDefaults,
  DestinationForm,
} from "#/features/destinations/ui/destination-form";
import type {
  DestinationCatalog,
  DestinationFormPreviewInput,
  DestinationSubmitResult,
} from "#/features/destinations/ui/destination-ui-types";
import { AppIntlProvider } from "#/i18n/provider";

const defaultDestinationCatalog = createDefaultDestinationRegistry().toCatalog();

describe("destination form", () => {
  afterEach(() => {
    cleanup();
  });

  it("switches Feishu templates between text and card modes", () => {
    renderDestinationForm({ kind: "feishu" });

    expect(
      screen.getByRole("button", { name: "Tocsin built-in" }).hasAttribute("data-pressed"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(screen.getByText("Available variables")).toBeTruthy();
    expect(screen.getByLabelText("Feishu card JSON")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    expect(screen.getByLabelText("Message template")).toBeTruthy();
  });

  it("shows Feishu card JSON configuration help", () => {
    renderDestinationForm({ kind: "feishu" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(screen.getByRole("button", { name: "How to configure Feishu card JSON" })).toBeTruthy();
  });

  it("hides Feishu card JSON configuration help when disabled by manifest", () => {
    renderDestinationForm(
      { kind: "feishu" },
      { destinationCatalog: destinationCatalogWithHiddenFeishuCardHelp() },
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(screen.queryByRole("button", { name: "How to configure Feishu card JSON" })).toBeNull();
  });

  it("inserts template variables into the active template field", () => {
    renderDestinationForm({ kind: "feishu" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "event.title" }));

    expect((screen.getByLabelText("Message template") as HTMLTextAreaElement).value).toBe(
      "{{event.title}}",
    );

    fireEvent.click(screen.getByRole("button", { name: "Feishu card" }));
    fireEvent.change(screen.getByLabelText("Feishu card JSON"), {
      target: {
        value: '{"content": "base"}',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "source.name" }));

    expect((screen.getByLabelText("Feishu card JSON") as HTMLTextAreaElement).value).toBe(
      '{"content": "base"} {{source.name}}',
    );
  });

  it("restores the default Feishu card template", () => {
    renderDestinationForm({ kind: "feishu" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Feishu card JSON"), {
      target: {
        value: '{"content": "custom"}',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore default card" }));

    expect(screen.queryByLabelText("Feishu card JSON")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Tocsin built-in" }).hasAttribute("data-pressed"),
    ).toBe(true);
  });

  it("applies dynamic status colors to a saved fixed-color card", () => {
    renderDestinationForm({
      kind: "feishu",
      templateSource: "custom",
      templateMode: "feishu_card",
      templateColorEnabled: false,
      templateBindings: "{}",
      templateCard: JSON.stringify({
        header: {
          template: "red",
          text_tag_list: [
            {
              text: { content: "{{event.status}}" },
              color: "orange",
            },
          ],
        },
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply dynamic status colors" }));

    const cardTemplate = (screen.getByLabelText("Feishu card JSON") as HTMLTextAreaElement).value;

    expect(cardTemplate).toContain('"template": "{{bindings.statusColor}}"');
    expect(cardTemplate).toContain('"color": "{{bindings.statusColor}}"');
    expect(screen.getByText("Dynamic card color")).toBeTruthy();
  });

  it("previews the selected resolved status", async () => {
    const onPreview = vi.fn<(input: DestinationFormPreviewInput) => DestinationSubmitResult>();

    renderDestinationForm(
      {
        name: "Feishu SRE",
        kind: "feishu",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/example",
      },
      { onPreview },
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolved" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(onPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleStatus: "resolved",
          config: expect.objectContaining({
            template: expect.objectContaining({
              source: "builtin",
              id: "feishu.alert-card",
              version: 1,
              bindings: expect.objectContaining({
                statusColor: expect.objectContaining({
                  select: "event.status",
                }),
              }),
            }),
          }),
        }),
      );
    });
  });
});

function renderDestinationForm(
  overrides: Partial<ReturnType<typeof createDestinationDefaults>> = {},
  options: {
    destinationCatalog?: DestinationCatalog;
    onPreview?: (input: DestinationFormPreviewInput) => DestinationSubmitResult;
  } = {},
) {
  render(
    <AppIntlProvider locale="en-US">
      <DestinationForm
        mode="create"
        pending={false}
        feishuApps={[]}
        destinationCatalog={options.destinationCatalog ?? defaultDestinationCatalog}
        defaultValues={{
          ...createDestinationDefaults(),
          ...overrides,
        }}
        onPreview={
          options.onPreview ??
          vi.fn<(input: DestinationFormPreviewInput) => DestinationSubmitResult>()
        }
        onSubmit={vi.fn<() => DestinationSubmitResult>()}
      />
    </AppIntlProvider>,
  );
}

function destinationCatalogWithHiddenFeishuCardHelp(): DestinationCatalog {
  return defaultDestinationCatalog.map((item) =>
    item.kind === "feishu"
      ? {
          ...item,
          configFields: item.configFields.map((field) =>
            field.type === "template"
              ? {
                  ...field,
                  modes: field.modes?.map((mode) =>
                    mode.mode === "feishu_card" && mode.help
                      ? {
                          ...mode,
                          help: {
                            ...mode.help,
                            show: false,
                          },
                        }
                      : mode,
                  ),
                }
              : field,
          ),
        }
      : item,
  );
}

describe("template variable reference (#55)", () => {
  it("offers every variable the engine allows, plus the dynamic prefixes", async () => {
    const { TemplateVariablePaths, TemplateVariablePrefixes } =
      await import("@tocsin/destinations");

    // The panel used to be a hand-written subset of 18 while the engine allowed
    // 45, so most working variables were invisible to the operator.
    expect(TemplateVariablePaths.length).toBeGreaterThan(18);

    renderDestinationForm({ kind: "slack" });

    for (const path of TemplateVariablePaths) {
      expect(screen.getByRole("button", { name: path })).toBeTruthy();
    }

    // Dynamic prefixes surface as patterns rather than as fabricated values.
    for (const prefix of TemplateVariablePrefixes) {
      expect(screen.getByRole("button", { name: `${prefix}<name>` })).toBeTruthy();
    }
  });
});
