// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import type { Operations } from "#/features/operations/model/operation-types";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ format, value }: { format: string; value: string }) => (
    <span data-format={format}>{value}</span>
  ),
}));

const now = new Date("2026-10-21T09:00:00.000Z");

describe("deliveries table next retry", () => {
  afterEach(() => {
    cleanup();
  });

  it("labels the column as a retry and keeps the date when it crosses days", () => {
    renderTable([deliveryRow({ nextAttemptAt: "2026-10-24T02:00:00.000Z" })]);

    expect(screen.getByText("Next retry")).toBeTruthy();
    expect(formatOf("2026-10-24T02:00:00.000Z")).toBe("dateTime");
  });

  it("shows only the clock time for a retry later today", () => {
    renderTable([deliveryRow({ nextAttemptAt: "2026-10-21T14:30:00.000Z" })]);

    expect(formatOf("2026-10-21T14:30:00.000Z")).toBe("time");
  });

  it("leaves a delivery without a retry empty", () => {
    renderTable([deliveryRow({ nextAttemptAt: null })]);

    expect(screen.queryByText("Next retry")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });
});

function renderTable(deliveries: Operations["deliveries"]["items"]): void {
  render(
    <AppIntlProvider locale="en-US" now={now} timeZone="UTC">
      <DeliveriesTable
        deliveries={deliveries}
        destinationIconNames={new Map()}
        page={1}
        pageSize={20}
        total={deliveries.length}
        pending={false}
        hasActiveFilters={false}
        onInspect={() => {}}
        onRetry={() => {}}
        onPageChange={() => {}}
        onResetFilters={() => {}}
      />
    </AppIntlProvider>,
  );
}

function deliveryRow(
  overrides: Partial<Operations["deliveries"]["items"][number]> = {},
): Operations["deliveries"]["items"][number] {
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
    state: "failed",
    attemptCount: 2,
    nextAttemptAt: null,
    lastError: "connection reset",
    updatedAt: "2026-10-21T10:00:00.000Z",
    ...overrides,
  };
}

function formatOf(value: string): string | null | undefined {
  return screen.getByText(value).getAttribute("data-format");
}
