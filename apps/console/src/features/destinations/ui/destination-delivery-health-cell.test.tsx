// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DestinationDeliveryHealthCell } from "#/features/destinations/ui/destination-delivery-health-cell";
import { AppIntlProvider } from "#/i18n/provider";

describe("destination delivery health cell", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the latest outcomes, backlog, and recent failures", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationDeliveryHealthCell
          health={{
            lastSucceededAt: "2026-10-12T09:00:05.000Z",
            lastFailedAt: "2026-10-12T09:30:10.000Z",
            queuedCount: 2,
            recentFailureCount: 3,
          }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText(/^Success /)).toBeTruthy();
    expect(screen.getByText(/^Failed /)).toBeTruthy();
    expect(screen.getByText("Queued 2")).toBeTruthy();
    expect(screen.getByText("3 failed · 24h")).toBeTruthy();
  });

  it("says so when the destination has no delivery history at all", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationDeliveryHealthCell
          health={{
            lastSucceededAt: null,
            lastFailedAt: null,
            queuedCount: 0,
            recentFailureCount: 0,
          }}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No deliveries")).toBeTruthy();
  });

  it("renders the empty marker when a response omits health", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DestinationDeliveryHealthCell health={undefined} />
      </AppIntlProvider>,
    );

    expect(screen.getByText("—")).toBeTruthy();
  });
});
