// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import type { DeliveryTimeField, Operations } from "#/features/operations/model/operation-types";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

const now = new Date("2026-10-23T09:00:00.000Z");
const createdAt = "2026-10-23T08:00:00.000Z";
const updatedAt = "2026-10-23T10:00:00.000Z";

describe("deliveries table time column", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the enqueue time when the list is ordered by creation", () => {
    renderTable("created");

    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText(createdAt)).toBeTruthy();
    expect(screen.queryByText(updatedAt)).toBeNull();
  });

  it("shows the last activity time when the list is ordered by update", () => {
    renderTable("updated");

    expect(screen.getByText("Updated")).toBeTruthy();
    expect(screen.getByText(updatedAt)).toBeTruthy();
    expect(screen.queryByText(createdAt)).toBeNull();
  });
});

function renderTable(timeField: DeliveryTimeField): void {
  render(
    <AppIntlProvider locale="en-US" now={now} timeZone="UTC">
      <DeliveriesTable
        deliveries={[deliveryRow()]}
        destinationIconNames={new Map()}
        page={1}
        pageSize={20}
        total={1}
        pending={false}
        hasActiveFilters={false}
        timeField={timeField}
        onInspect={() => {}}
        onRetry={() => {}}
        onPageChange={() => {}}
        onResetFilters={() => {}}
      />
    </AppIntlProvider>,
  );
}

function deliveryRow(): Operations["deliveries"]["items"][number] {
  return {
    id: "delivery-1",
    eventId: "event-1",
    eventTitle: "Disk almost full",
    eventSeverity: "critical",
    eventStatus: "firing",
    sourceName: "Prometheus",
    destinationName: "Ops group",
    destinationKind: "feishu",
    routeName: "Primary route",
    providerReference: null,
    state: "succeeded",
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    createdAt,
    updatedAt,
  };
}
