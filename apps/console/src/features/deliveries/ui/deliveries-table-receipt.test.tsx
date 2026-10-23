// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import { deliveriesColumnClassName } from "#/features/deliveries/ui/deliveries-table-layout";
import type { Operations } from "#/features/operations/model/operation-types";
import { AppIntlProvider } from "#/i18n/provider";

const now = new Date("2026-10-23T09:00:00.000Z");

describe("deliveries table receipt", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the target's message reference without opening the delivery", () => {
    renderTable([
      deliveryRow({
        providerReference: { type: "feishu_message_id", value: "om_abc123" },
      }),
    ]);

    expect(screen.getByText("Receipt")).toBeTruthy();
    expect(screen.getByText("om_abc123")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy external reference" })).toBeTruthy();
  });

  it("leaves a delivery without a receipt empty", () => {
    renderTable([deliveryRow({ providerReference: null })]);

    const receiptCell = screen.getAllByRole("cell")[4];

    expect(receiptCell?.textContent).toBe("—");
  });

  it("clips a long reference inside its fixed-width column", () => {
    // The column shares the 1280x900 viewport with eight others, so an
    // unknown-length message id must not paint over the retry column.
    expect(deliveriesColumnClassName("receipt")).toContain("truncate");
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
    providerReference: null,
    state: "succeeded",
    attemptCount: 1,
    nextAttemptAt: null,
    lastError: null,
    updatedAt: "2026-10-23T10:00:00.000Z",
    ...overrides,
  };
}
