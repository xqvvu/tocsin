// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationPreviewResult, DestinationTestResult } from "@tocsin/core";

import { AppIntlProvider } from "#/i18n/provider";

import { DestinationPreviewDialog, showDestinationTestToast } from "./destination-notices";

const testState = vi.hoisted(() => ({
  toast: {
    error: vi.fn<(title: string, options?: { description?: ReactNode }) => void>(),
    success: vi.fn<(title: string, options?: { description?: ReactNode }) => void>(),
  },
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

describe("destination notices", () => {
  afterEach(() => {
    cleanup();
    testState.toast.error.mockClear();
    testState.toast.success.mockClear();
  });

  it("shows rendered payload in the preview dialog", () => {
    const notice = createPreviewNotice();

    render(
      <AppIntlProvider locale="en-US">
        <DestinationPreviewDialog open onOpenChange={() => {}} notice={notice} />
      </AppIntlProvider>,
    );

    expect(screen.getByText(/"text": "disk full"/)).toBeTruthy();
    expect(screen.getByText(/"service": "api"/)).toBeTruthy();
    expect(screen.getByText("Payload")).toBeTruthy();
    expect(screen.getByText("Normalized")).toBeTruthy();
    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByText("Raw reference")).toBeTruthy();
    expect(screen.getByText("Diagnostics")).toBeTruthy();
  });

  it("says so explicitly when the preview found no diagnostics", () => {
    renderPreviewDialog(createPreviewNotice());

    fireEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));

    expect(screen.getByText("No diagnostics found")).toBeTruthy();
  });

  it("renders preview diagnostics as readable rows instead of raw JSON", () => {
    renderPreviewDialog(
      createPreviewNotice({
        diagnostics: [
          {
            severity: "error",
            path: "template.payload.url",
            variable: "config.webhookUrl",
            message:
              "Destination template contains unknown variable: config.webhookUrl (did you mean tocsin.eventUrl?)",
          },
          {
            severity: "warning",
            path: "template.bindings.unusedColor",
            variable: "bindings.unusedColor",
            message: "Destination template binding is not referenced: unusedColor",
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Diagnostics" }));

    expect(screen.getByText("Error")).toBeTruthy();
    expect(screen.getByText("Warning")).toBeTruthy();
    expect(screen.getByText("template.payload.url")).toBeTruthy();
    expect(screen.getByText("template.bindings.unusedColor")).toBeTruthy();
    expect(
      screen.getByText(
        "Destination template contains unknown variable: config.webhookUrl (did you mean tocsin.eventUrl?)",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Destination template binding is not referenced: unusedColor"),
    ).toBeTruthy();
  });

  it("lets the operator preview with a historical Event sample", async () => {
    const onSampleChange = vi.fn<(sampleEventId: string | null) => void>();

    render(
      <AppIntlProvider locale="en-US">
        <DestinationPreviewDialog
          open
          onOpenChange={() => {}}
          notice={createPreviewNotice()}
          sampleEvents={[
            {
              id: "event-1",
              title: "Disk full",
              sourceName: "Grafana",
              receivedAt: "2026-01-01T00:00:00.000Z",
            },
          ]}
          onSampleChange={onSampleChange}
        />
      </AppIntlProvider>,
    );

    const picker = screen.getByRole("combobox", { name: "Sample source" });
    expect(picker.textContent).toContain("Built-in sample");
    expect(screen.getByText(/Rendered from the built-in sample/)).toBeTruthy();

    fireEvent.click(picker);
    const option = await screen.findByRole("option", { name: "Disk full · Grafana" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);

    expect(onSampleChange).toHaveBeenCalledWith("event-1");
  });

  it("names the historical Event and its source once that sample is in use", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationPreviewDialog
          open
          onOpenChange={() => {}}
          notice={createPreviewNotice({
            sample: {
              kind: "historical_event",
              eventId: "event-1",
              source: {
                id: "source-1",
                name: "Grafana prod",
                provider: "grafana",
                enabled: true,
              },
              receivedAt: "2026-01-01T00:00:00.000Z",
            },
          })}
          sampleEvents={[
            {
              id: "event-1",
              title: "Disk full",
              sourceName: "Grafana prod",
              receivedAt: "2026-01-01T00:00:00.000Z",
            },
          ]}
          onSampleChange={() => {}}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Sample source" }).textContent).toContain(
      "Disk full · Grafana prod",
    );
    expect(screen.getByText(/Rendered from a historical Event · Grafana prod/)).toBeTruthy();
  });

  it("shows destination test response bodies in a toast", () => {
    const t = ((key: string, values?: Record<string, unknown>) => {
      if (key === "destinations.notice.testFailedTitle") {
        return `Test ${String(values?.name)}: failed`;
      }

      if (key === "destinations.notice.testRejected") {
        return "Destination sender rejected the test";
      }

      return key;
    }) as Parameters<typeof showDestinationTestToast>[1];

    const notice: DestinationTestResult = {
      success: false,
      destination: {
        id: "destination-1",
        name: "Ops Webhook",
        kind: "generic_webhook",
        enabled: true,
      },
      statusCode: 502,
      error: "Downstream rejected the request",
      responseBody: "bad gateway token=[REDACTED]",
      renderedPayload: { message: "Tocsin destination test" },
    };

    showDestinationTestToast(notice, t);

    expect(testState.toast.error).toHaveBeenCalledWith(
      "Test Ops Webhook: failed",
      expect.objectContaining({
        description: expect.any(Object),
      }),
    );

    const description = testState.toast.error.mock.calls[0]?.[1]?.description;
    render(<>{description}</>);

    expect(screen.getByText("Downstream rejected the request")).toBeTruthy();
    expect(screen.getByText("bad gateway token=[REDACTED]")).toBeTruthy();
  });
});

function renderPreviewDialog(notice: DestinationPreviewResult) {
  render(
    <AppIntlProvider locale="en-US">
      <DestinationPreviewDialog open onOpenChange={() => {}} notice={notice} />
    </AppIntlProvider>,
  );
}

function createPreviewNotice(
  overrides: Partial<DestinationPreviewResult> = {},
): DestinationPreviewResult {
  return {
    destination: {
      id: "destination-1",
      name: "Ops Slack",
      kind: "slack",
      enabled: true,
    },
    renderedPayload: {
      text: "disk full",
      labels: {
        service: "api",
      },
    },
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
      title: "Disk full",
      message: "disk is full",
      severity: "critical",
      status: "firing",
      fingerprint: "disk:api",
      labels: {
        service: "api",
      },
      occurredAt: "2026-01-01T00:00:00.000Z",
    },
    context: {
      event: {
        id: "preview-event",
        title: "Disk full",
        message: "disk is full",
        severity: "critical",
        severityDisplay: "Critical",
        status: "firing",
        statusDisplay: "Firing",
        fingerprint: "disk:api",
        occurredAt: "2026-01-01T00:00:00.000Z",
        occurredAtDisplay: "Jan 1, 2026",
        labels: {
          service: "api",
        },
      },
      source: {
        id: "preview-source",
        name: "Tocsin preview",
        provider: "generic",
      },
      destination: {
        id: "destination-1",
        name: "Ops Slack",
        kind: "slack",
      },
      presentation: {
        locale: "en-US",
        timeZone: "UTC",
        labels: {
          summary: "Alert summary",
        },
      },
      tocsin: {
        eventUrl: "",
        deliveryUrl: "",
      },
      payload: {},
      bindings: {},
    },
    rawPayloadReference: {
      eventId: "event-1",
      payload: {
        token: "[REDACTED]",
      },
      headers: {},
    },
    diagnostics: [],
    ...overrides,
  };
}
