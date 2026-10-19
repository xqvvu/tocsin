// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { OncallPing } from "@tocsin/core";

import { DeliveryPingsTable } from "#/features/deliveries/ui/delivery-pings-table";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

describe("delivery pings table", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows who initiated a manual page and the call timeline", () => {
    renderTable([
      pingFixture({
        trigger: "manual",
        initiatedBy: "user-1",
        firedAt: "2026-10-19T01:02:00.000Z",
        nextAttemptAt: "2026-10-19T01:07:00.000Z",
        state: "running",
      }),
    ]);

    expect(screen.getByText("Call fired")).toBeTruthy();
    expect(screen.getByText("Next retry")).toBeTruthy();
    expect(screen.getByText("Manual")).toBeTruthy();
    expect(screen.getByText("Initiated by user-1")).toBeTruthy();
    expect(screen.getByText("2026-10-19T01:02:00.000Z")).toBeTruthy();
    expect(screen.getByText("2026-10-19T01:07:00.000Z")).toBeTruthy();
  });

  it("leaves the timeline empty for an automatic page that has not fired", () => {
    renderTable([pingFixture({ trigger: "auto" })]);

    expect(screen.getByText("Auto")).toBeTruthy();
    expect(screen.queryByText(/Initiated by/)).toBeNull();
    // Call fired, next retry and last error all fall back to the shared dash.
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("explains an empty ping list instead of rendering a blank table", () => {
    renderTable([]);

    expect(screen.getByText("No urgent calls for this delivery")).toBeTruthy();
  });
});

function renderTable(pings: OncallPing[]): void {
  render(
    <AppIntlProvider locale="en-US">
      <DeliveryPingsTable pings={pings} />
    </AppIntlProvider>,
  );
}

function pingFixture(overrides: Partial<OncallPing> = {}): OncallPing {
  return {
    id: "ping-1",
    deliveryId: "delivery-1",
    destinationId: "destination-1",
    eventId: "event-1",
    receiver: "ou_123",
    channel: "feishu_urgent_phone",
    state: "running",
    trigger: "manual",
    initiatedBy: null,
    providerReference: null,
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    createdAt: "2026-10-19T01:00:00.000Z",
    updatedAt: "2026-10-19T01:00:00.000Z",
    firedAt: null,
    ...overrides,
  };
}
