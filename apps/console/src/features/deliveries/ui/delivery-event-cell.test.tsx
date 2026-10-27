// @vitest-environment jsdom

import { cleanup, render as renderRaw, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveryEventCell } from "#/features/deliveries/ui/delivery-event-cell";
import { AppIntlProvider } from "#/i18n/provider";

// The cell only needs Link's destination; rendering a plain anchor keeps this
// unit test free of a router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? "")} {...rest}>
      {children}
    </a>
  ),
}));

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

  it("links the alert title back to the event", () => {
    render(
      <DeliveryEventCell
        eventId="evt-7f3a"
        eventTitle="Disk full on web-01"
        eventSeverity="critical"
        eventStatus="firing"
        sourceName="Prometheus"
      />,
    );

    // Without the link the delivery list was a dead end: operators had to copy
    // the opaque event id and search again.
    expect(screen.getByRole("link", { name: "Disk full on web-01" }).getAttribute("href")).toBe(
      "/events/evt-7f3a",
    );
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

    expect(screen.getByText("Resolved").className).not.toContain("text-destructive");
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

    // `info` keeps the severity badge neutral, so the destructive emphasis can
    // only come from the firing status.
    expect(screen.getByText("Firing").className).toContain("text-destructive");
  });
});
