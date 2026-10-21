// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationTestResult } from "@tocsin/core";

import { AppIntlProvider } from "#/i18n/provider";

import { DestinationTestDialog } from "./destination-test-dialog";

const testResult: DestinationTestResult = {
  destination: {
    id: "destination-1",
    name: "Ops webhook",
    kind: "generic_webhook",
    enabled: true,
  },
  success: true,
  statusCode: 202,
  responseBody: "accepted",
  error: null,
  renderedPayload: { eventId: "event-1" },
};

describe("destination test dialog", () => {
  afterEach(cleanup);

  it("sends the built-in sample by default", async () => {
    const onSend = vi.fn<(sampleEventId: string | null) => Promise<DestinationTestResult | null>>(
      async () => testResult,
    );
    const onOpenChange = vi.fn<(open: boolean) => void>();

    render(
      <AppIntlProvider locale="en-US">
        <DestinationTestDialog
          destinationName="Ops webhook"
          open
          onOpenChange={onOpenChange}
          onSend={onSend}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send test" }));

    expect(onSend).toHaveBeenCalledWith(null);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("sends with the selected historical Event", async () => {
    const onSend = vi.fn<(sampleEventId: string | null) => Promise<DestinationTestResult | null>>(
      async () => testResult,
    );

    render(
      <AppIntlProvider locale="en-US">
        <DestinationTestDialog
          destinationName="Ops webhook"
          open
          onOpenChange={() => {}}
          sampleEvents={[
            {
              id: "event-1",
              title: "Disk full",
              sourceName: "Grafana",
              receivedAt: "2026-01-01T00:00:00.000Z",
            },
          ]}
          onSend={onSend}
        />
      </AppIntlProvider>,
    );

    const picker = screen.getByRole("combobox", { name: "Test sample" });
    fireEvent.click(picker);
    const option = await screen.findByRole("option", { name: "Disk full · Grafana" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Send test" }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith("event-1"));
  });

  it("stays open when the send does not complete", async () => {
    const onSend = vi.fn<() => Promise<DestinationTestResult | null>>(async () => null);
    const onOpenChange = vi.fn<(open: boolean) => void>();

    render(
      <AppIntlProvider locale="en-US">
        <DestinationTestDialog
          destinationName="Ops webhook"
          open
          onOpenChange={onOpenChange}
          onSend={onSend}
        />
      </AppIntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send test" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Send test" })).toBeTruthy());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
