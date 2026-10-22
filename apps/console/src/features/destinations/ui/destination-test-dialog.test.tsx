// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationTestResult } from "@tocsin/core";

import { AppIntlProvider } from "#/i18n/provider";

import { DestinationTestDialog } from "./destination-test-dialog";

const settingsState = vi.hoisted(() => ({ paused: false }));

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  appSettingsQueryOptions: () => ({
    queryKey: ["test", "app-settings"],
    queryFn: async () => ({
      deliveryPaused: settingsState.paused,
      deliveryPausedAt: null,
      rawPayloadRetentionDays: 30,
    }),
    staleTime: Infinity,
  }),
}));

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
  afterEach(() => {
    cleanup();
    settingsState.paused = false;
  });

  it("sends the built-in sample by default", async () => {
    const onSend = vi.fn<(sampleEventId: string | null) => Promise<DestinationTestResult | null>>(
      async () => testResult,
    );
    const onOpenChange = vi.fn<(open: boolean) => void>();

    renderDialog(
      <DestinationTestDialog
        destinationName="Ops webhook"
        open
        onOpenChange={onOpenChange}
        onSend={onSend}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send test" }));

    expect(onSend).toHaveBeenCalledWith(null);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("sends with the selected historical Event", async () => {
    const onSend = vi.fn<(sampleEventId: string | null) => Promise<DestinationTestResult | null>>(
      async () => testResult,
    );

    renderDialog(
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
      />,
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

    renderDialog(
      <DestinationTestDialog
        destinationName="Ops webhook"
        open
        onOpenChange={onOpenChange}
        onSend={onSend}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send test" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Send test" })).toBeTruthy());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("warns that a test send bypasses the delivery pause", async () => {
    settingsState.paused = true;

    renderDialog(
      <DestinationTestDialog
        destinationName="Ops webhook"
        open
        onOpenChange={() => {}}
        onSend={async () => testResult}
      />,
    );

    expect((await screen.findByRole("note")).textContent).toContain(
      "bypass the queue and send immediately",
    );
  });
});

function renderDialog(ui: ReactElement): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <AppIntlProvider locale="en-US">
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </AppIntlProvider>,
  );
}
