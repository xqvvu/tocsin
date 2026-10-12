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
    // source.name is not a pinned common variable, so it lives under the
    // "Source" group — which must be opened before it can be clicked.
    fireEvent.click(screen.getByRole("button", { name: /Source/ }));
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
    const { layoutTemplateVariables, templateVariablePattern } =
      await import("#/features/destinations/ui/template-variable-panel");

    // The panel used to be a hand-written subset of 18 while the engine allowed
    // 45, so most working variables were invisible to the operator.
    expect(TemplateVariablePaths.length).toBeGreaterThan(18);

    const layout = layoutTemplateVariables();
    const offered = [
      ...layout.common,
      ...layout.groups.flatMap((group) => group.paths),
      ...layout.groups.flatMap((group) =>
        group.labelKeys.map((key) => `presentation.labels.${key}`),
      ),
    ];

    // Grouping must not drop a variable the engine accepts.
    for (const path of TemplateVariablePaths) {
      expect(offered).toContain(path);
      expect(offered.filter((entry) => entry === path)).toHaveLength(1);
    }

    // Dynamic prefixes surface as syntax hints rather than as fabricated values.
    for (const prefix of TemplateVariablePrefixes) {
      expect(layout.patterns).toContain(templateVariablePattern(prefix));
    }
  });

  it("inserts the variable chosen from the grouped panel", () => {
    renderDestinationForm({ kind: "feishu" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    fireEvent.change(screen.getByLabelText("Filter variables"), {
      target: { value: "event.severity" },
    });
    fireEvent.click(screen.getByRole("button", { name: "event.severity" }));

    expect((screen.getByLabelText("Message template") as HTMLTextAreaElement).value).toBe(
      "{{event.severity}}",
    );
  });
});

describe("template variable panel layout", () => {
  it("pins common variables once, folds the label keys, and hides groups it empties", async () => {
    const { layoutTemplateVariables, templateVariablePattern } =
      await import("#/features/destinations/ui/template-variable-panel");

    const layout = layoutTemplateVariables();

    // A pinned common variable is removed from its group, so it is not offered twice.
    for (const path of layout.common) {
      expect(layout.groups.flatMap((group) => group.paths)).not.toContain(path);
    }

    expect(layout.common).toContain("event.title");
    expect(layout.common).toContain("tocsin.eventUrl");

    // No empty group is rendered.
    expect(
      layout.groups.every((group) => group.paths.length > 0 || group.labelKeys.length > 0),
    ).toBe(true);

    // `tocsin` only ever held `tocsin.eventUrl`, which is now pinned as common.
    expect(layout.groups.map((group) => group.id)).not.toContain("tocsin");

    // The engine's 26 presentation paths collapse to two entries plus the label
    // key list, instead of 24 flat label buttons.
    const presentation = layout.groups.find((group) => group.id === "presentation");
    expect(presentation?.paths).toEqual(["presentation.locale", "presentation.timeZone"]);
    expect(presentation?.labelKeys.length).toBeGreaterThan(20);

    const visible = [...layout.common, ...layout.groups.flatMap((group) => group.paths)];
    expect(visible.length).toBeLessThan(25);

    // The payload prefix is shown as the syntax the engine actually accepts: a
    // bare `payload.<name>` is rejected by `isAllowedTemplatePath`, so the old
    // `<name>` spelling advertised an insertion that produced a diagnostic.
    expect(templateVariablePattern("payload.")).toBe("payload.<key>");
    expect(templateVariablePattern("event.labels.")).toBe("event.labels.<name>");
  });
});
