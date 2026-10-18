// @vitest-environment jsdom

import { cleanup, render as renderRaw, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DeliveryEventCell } from "#/features/deliveries/ui/delivery-event-cell";
import { AppIntlProvider } from "#/i18n/provider";

function render(ui: ReactNode) {
  return renderRaw(<AppIntlProvider locale="en-US">{ui}</AppIntlProvider>);
}

describe("delivery event cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the alert identity instead of only the internal event id", () => {
    const { container } = render(
      <DeliveryEventCell
        eventId="evt-7f3a"
        eventTitle="Disk full on web-01"
        eventSeverity="critical"
        eventStatus="firing"
        sourceName="Prometheus"
      />,
    );

    // The list used to show only the source name and the opaque event id, which
    // forced a second lookup to learn which alert a delivery belongs to.
    expect(screen.getByText("Disk full on web-01")).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("Firing")).toBeTruthy();
    expect(screen.getByText("Prometheus")).toBeTruthy();
    expect(screen.getByText("evt-7f3a")).toBeTruthy();

    expect(screen.getByText("Disk full on web-01").getAttribute("title")).toBe(
      "Disk full on web-01",
    );
    expect(screen.getByText("evt-7f3a").getAttribute("title")).toBe("evt-7f3a");
    expect(container.textContent).toContain("·");
  });

  it("marks a resolved alert without the firing emphasis", () => {
    render(
      <DeliveryEventCell
        eventId="evt-2"
        eventTitle="Latency elevated"
        eventSeverity="warning"
        eventStatus="resolved"
        sourceName="Alertmanager"
      />,
    );

    expect(screen.getByText("Resolved").className).not.toContain("text-red-700");
  });

  it("keeps the firing marker when the alert is still active", () => {
    render(
      <DeliveryEventCell
        eventId="evt-3"
        eventTitle="Disk full"
        eventSeverity="info"
        eventStatus="firing"
        sourceName="Prometheus"
      />,
    );

    // `info` keeps the severity badge neutral, so the red emphasis can only
    // come from the firing status.
    expect(screen.getByText("Firing").className).toContain("text-red-700");
  });
});
