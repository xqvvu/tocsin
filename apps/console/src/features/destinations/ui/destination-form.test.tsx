// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationPreviewResult, TemplateDiagnostic } from "@tocsin/core";
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

  // The edit dialog can insert a queued-delivery notice between its header and
  // this form. A fixed max-height on the form ignored that notice and pushed
  // the footer outside the dialog's overflow-hidden shell, so Save and Preview
  // became unreachable. The form must be the flex consumer and the footer must
  // stay outside the scroll area.
  it("keeps the dialog footer outside the scrolling body", () => {
    const { container } = renderDestinationForm({}, { layout: "dialog" });

    const form = container.querySelector("form");
    const body = form?.firstElementChild;
    const footer = form?.lastElementChild;

    expect(form?.className).toContain("flex-1");
    expect(form?.className).toContain("min-h-0");
    expect(form?.className).not.toContain("max-h-");
    expect(body?.className).toContain("overflow-y-auto");
    expect(body?.contains(footer ?? null)).toBe(false);
    expect(footer?.className).toContain("shrink-0");
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

    const editor = screen.getByLabelText("Feishu card JSON") as HTMLTextAreaElement;

    fireEvent.change(editor, {
      target: {
        value: '{"content": "base"}',
      },
    });
    // The operator's caret sits inside the string, where the variable belongs.
    // Inserting at the end of the body instead produced
    // `{"content": "base"} {{source.name}}` — valid-looking text that no JSON
    // parser accepts.
    editor.focus();
    editor.setSelectionRange(17, 17);
    // source.name is not a pinned common variable, so it lives under the
    // "Source" group — which must be opened before it can be clicked.
    fireEvent.click(screen.getByRole("button", { name: /Source/ }));
    fireEvent.click(screen.getByRole("button", { name: "source.name" }));

    expect(editor.value).toBe('{"content": "base{{source.name}}"}');
  });

  it("inserts at the caret in the middle of a JSON body and leaves the caret after it", () => {
    renderDestinationForm({ kind: "generic_webhook", templateMode: "json_payload" });

    const editor = screen.getByLabelText("JSON payload template") as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: '{"text": "hi"}' } });
    editor.focus();
    editor.setSelectionRange(12, 12);

    fireEvent.click(screen.getByRole("button", { name: "event.title" }));

    // The variable landed inside the string, so the body is still valid JSON.
    expect(editor.value).toBe('{"text": "hi{{event.title}}"}');
    expect(JSON.parse(editor.value)).toEqual({ text: "hi{{event.title}}" });
    // The caret sits right after it, ready for the next variable.
    expect(editor.selectionStart).toBe(27);
    expect(editor.selectionEnd).toBe(27);
  });

  it("appends the variable when no template body field holds a caret", () => {
    renderDestinationForm({ kind: "feishu" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.change(screen.getByLabelText("Message template"), { target: { value: "hello" } });

    fireEvent.click(screen.getByRole("button", { name: "event.title" }));

    expect((screen.getByLabelText("Message template") as HTMLTextAreaElement).value).toBe(
      "hello {{event.title}}",
    );
  });

  it("inserts at the caret in the middle of a text body", () => {
    renderDestinationForm({ kind: "feishu" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    const editor = screen.getByLabelText("Message template") as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "a b" } });
    editor.focus();
    editor.setSelectionRange(2, 2);

    fireEvent.click(screen.getByRole("button", { name: "event.title" }));

    expect(editor.value).toBe("a {{event.title}}b");
    expect(editor.selectionStart).toBe(17);
  });

  it("names the template toggle groups", () => {
    renderDestinationForm({ kind: "feishu" });

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(screen.getByRole("group", { name: "Template source" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Template type" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Preview status" })).toBeTruthy();
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
    layout?: "panel" | "dialog";
  } = {},
) {
  return render(
    <AppIntlProvider locale="en-US">
      <DestinationForm
        mode="create"
        pending={false}
        feishuApps={[]}
        layout={options.layout}
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

/** Minimal preview result the form only reads `diagnostics` from. */
function previewNotice(diagnostics: TemplateDiagnostic[]): DestinationPreviewResult {
  return {
    destination: {
      id: "destination-1",
      name: "Ops Webhook",
      kind: "generic_webhook",
      enabled: true,
    },
    renderedPayload: { message: "Tocsin destination test" },
    sample: {
      kind: "built_in",
      eventId: "preview-event",
      source: {
        id: "preview-source",
        name: "Tocsin preview",
        provider: "generic",
        enabled: true,
      },
      receivedAt: null,
    },
    normalizedEvent: {
      title: "Tocsin destination test",
      message: "This is a test alert generated from Tocsin Console",
      severity: "info",
      status: "firing",
      fingerprint: "preview",
      occurredAt: "2026-01-01T00:00:00.000Z",
      labels: {},
    },
    context: {
      event: {
        id: "preview-event",
        title: "Tocsin destination test",
        message: "This is a test alert generated from Tocsin Console",
        severity: "info",
        severityDisplay: "Info",
        status: "firing",
        statusDisplay: "Firing",
        fingerprint: "preview",
        occurredAt: "2026-01-01T00:00:00.000Z",
        occurredAtDisplay: "Jan 1, 2026",
        labels: {},
      },
      source: {
        id: "preview-source",
        name: "Tocsin preview",
        provider: "generic",
      },
      destination: {
        id: "destination-1",
        name: "Ops Webhook",
        kind: "generic_webhook",
      },
      presentation: {
        locale: "en-US",
        timeZone: "UTC",
        labels: {},
      },
      tocsin: {
        eventUrl: "",
      },
      payload: {},
      bindings: {},
    },
    diagnostics,
    rawPayloadReference: null,
  };
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

describe("template diagnostics in the editor", () => {
  afterEach(() => {
    cleanup();
  });

  it("names the line and column of a JSON syntax error while typing", () => {
    renderDestinationForm({ kind: "generic_webhook", templateMode: "json_payload" });

    const editor = screen.getByLabelText("JSON payload template");

    // A trailing comma: the parser stops on the closing brace on line 3.
    fireEvent.change(editor, { target: { value: '{\n  "text": "hi",\n}' } });

    expect(screen.getByText("Template JSON syntax error at line 3, column 1")).toBeTruthy();

    // The error disappears the moment the document parses again.
    fireEvent.change(editor, { target: { value: '{"text": "hi"}' } });

    expect(screen.queryByText("Template JSON syntax error at line 3, column 1")).toBeNull();
  });

  it("reports valid JSON that is not an object as the field's own error", () => {
    renderDestinationForm({ kind: "generic_webhook", templateMode: "json_payload" });

    fireEvent.change(screen.getByLabelText("JSON payload template"), {
      target: { value: "[1, 2]" },
    });

    expect(screen.getByText("Template JSON must be a valid JSON object")).toBeTruthy();
  });

  it("associates the template body editor with its own error text", () => {
    renderDestinationForm({ kind: "generic_webhook", templateMode: "json_payload" });

    const editor = screen.getByLabelText("JSON payload template") as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "[1, 2]" } });

    // A screen reader follows `aria-describedby` to the message, so the error
    // reaches the field it belongs to instead of only the alert region.
    const errorId = editor.getAttribute("aria-describedby");

    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId as string)?.textContent).toBe(
      "Template JSON must be a valid JSON object",
    );
    expect(editor.getAttribute("aria-invalid")).toBe("true");
  });

  it("shows the diagnostics returned by the last preview", async () => {
    const diagnostics: TemplateDiagnostic[] = [
      {
        severity: "error",
        path: "template.payload.url",
        variable: "config.webhookUrl",
        message:
          "Destination template contains unknown variable: config.webhookUrl (did you mean tocsin.eventUrl?)",
      },
    ];

    renderDestinationForm(
      {
        name: "Ops Webhook",
        kind: "generic_webhook",
        webhookUrl: "https://example.test/hook",
        templateMode: "json_payload",
        templatePayload: '{"url": "{{config.webhookUrl}}"}',
      },
      {
        onPreview: vi.fn<(input: DestinationFormPreviewInput) => DestinationSubmitResult>(() =>
          previewNotice(diagnostics),
        ),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("Template diagnostics")).toBeTruthy();
    });
    expect(screen.getByText("template.payload.url")).toBeTruthy();
    expect(
      screen.getByText(
        "Destination template contains unknown variable: config.webhookUrl (did you mean tocsin.eventUrl?)",
      ),
    ).toBeTruthy();

    // Editing the body invalidates the snapshot instead of leaving a verdict
    // for a document that no longer exists.
    fireEvent.change(screen.getByLabelText("JSON payload template"), {
      target: { value: '{"url": "static"}' },
    });

    expect(screen.queryByText("template.payload.url")).toBeNull();
  });

  it("confirms when the last preview found no diagnostics", async () => {
    renderDestinationForm(
      {
        name: "Ops Webhook",
        kind: "generic_webhook",
        webhookUrl: "https://example.test/hook",
        templateMode: "json_payload",
      },
      {
        onPreview: vi.fn<(input: DestinationFormPreviewInput) => DestinationSubmitResult>(() =>
          previewNotice([]),
        ),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await waitFor(() => {
      expect(screen.getByText("No diagnostics found")).toBeTruthy();
    });
  });
});
