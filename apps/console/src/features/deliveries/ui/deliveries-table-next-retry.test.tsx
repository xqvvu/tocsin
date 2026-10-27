// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveriesTable } from "#/features/deliveries/ui/deliveries-table";
import { deliveriesColumnClassName } from "#/features/deliveries/ui/deliveries-table-layout";
import type { Operations } from "#/features/operations/model/operation-types";
import { AppIntlProvider } from "#/i18n/provider";

// The event cell links back to the event; rendering a plain anchor keeps this
// table test free of a router.
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
    // The receipt column also renders a dash for an empty value, so target the
    // retry cell by position instead of the first dash on the page.
    expect(screen.getAllByRole("cell")[5]?.textContent).toBe("—");
  });

  it("shows the attempt count against the retry budget", () => {
    renderTable([deliveryRow({ attemptCount: 2, maxAttempts: 3 })]);

    expect(screen.getByText("2/3")).toBeTruthy();
  });

  it("labels a failure that spent its entire retry budget", () => {
    renderTable([deliveryRow({ state: "failed", attemptCount: 3, maxAttempts: 3 })]);

    expect(screen.getByText("Retries exhausted")).toBeTruthy();
  });

  it("keeps a scheduled retry from reading as exhausted", () => {
    renderTable([
      deliveryRow({
        state: "pending",
        attemptCount: 3,
        maxAttempts: 3,
        nextAttemptAt: "2026-10-24T02:00:00.000Z",
      }),
    ]);

    expect(screen.queryByText("Retries exhausted")).toBeNull();
    expect(formatOf("2026-10-24T02:00:00.000Z")).toBe("dateTime");
  });

  it("keeps the dash when a terminal failure still had budget left", () => {
    // A non-retryable error also ends in `failed`, but the operator can still
    // retry by hand, so the column must not claim the budget is gone.
    renderTable([deliveryRow({ state: "failed", attemptCount: 1, maxAttempts: 3 })]);

    expect(screen.queryByText("Retries exhausted")).toBeNull();
    expect(screen.getAllByRole("cell")[5]?.textContent).toBe("—");
  });

  it("clips a cross-day timestamp inside its fixed-width column", () => {
    renderTable([deliveryRow({ nextAttemptAt: "2026-10-24T02:00:00.000Z" })]);

    const cell = screen.getByText("2026-10-24T02:00:00.000Z").closest("td");

    // The column is narrower than a full date-time at the 1280x900 laptop
    // viewport, so the cell must clip instead of painting over "last error".
    expect(cell?.className).toContain("truncate");
    expect(deliveriesColumnClassName("next")).toContain("truncate");
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
        timeField="created"
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
    state: "failed",
    attemptCount: 2,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: "connection reset",
    createdAt: "2026-10-21T09:55:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
    ...overrides,
  };
}

function formatOf(value: string): string | null | undefined {
  return screen.getByText(value).getAttribute("data-format");
}
