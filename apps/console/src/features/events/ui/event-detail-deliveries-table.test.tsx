// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { EventDetailDeliveriesTable } from "#/features/events/ui/event-detail-deliveries-table";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { AppIntlProvider } from "#/i18n/provider";

// The silence column decides between a rule link and a "rule deleted" note; the
// link needs no router in this unit test.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params: { suppressionId: string };
  }) => <a href={`${to}/${params.suppressionId}`}>{children}</a>,
  ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const testState = vi.hoisted(() => ({
  retryDelivery: vi.fn<(input: { id: string }) => Promise<unknown>>(),
  invalidateOperations: vi.fn<() => Promise<void>>(),
  toast: {
    success: vi.fn<(title: string, options?: { description?: string }) => void>(),
    error: vi.fn<(title: string, options?: { description?: string }) => void>(),
  },
}));

vi.mock("#/features/operations/api/operation.mutations", () => ({
  useOperationMutations: () => ({
    retryDelivery: testState.retryDelivery,
    invalidateOperations: testState.invalidateOperations,
  }),
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

describe("event detail deliveries table", () => {
  beforeEach(() => {
    testState.retryDelivery.mockReset().mockResolvedValue({});
    testState.invalidateOperations.mockReset().mockResolvedValue();
    testState.toast.success.mockReset();
    testState.toast.error.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("offers a retry action only on failed deliveries", () => {
    renderTable([
      delivery({ id: "delivery-failed", state: "failed" }),
      delivery({ id: "delivery-succeeded", state: "succeeded" }),
    ]);

    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("re-queues the failed delivery without leaving the event", async () => {
    renderTable([delivery({ id: "delivery-failed", state: "failed" })]);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(testState.retryDelivery).toHaveBeenCalledExactlyOnceWith({ id: "delivery-failed" });
    });
    expect(testState.invalidateOperations).toHaveBeenCalled();
  });

  it("keeps the empty state readable across the added action column", () => {
    renderTable([]);

    expect(screen.getByText("No deliveries created")).toBeTruthy();
  });

  it("lists deliveries in operational priority order", () => {
    renderTable([
      delivery({ id: "delivery-succeeded", state: "succeeded", destinationName: "Succeeded sink" }),
      delivery({
        id: "delivery-suppressed",
        state: "suppressed",
        destinationName: "Silenced sink",
      }),
      delivery({ id: "delivery-failed", state: "failed", destinationName: "Failed sink" }),
      delivery({ id: "delivery-running", state: "running", destinationName: "Running sink" }),
      delivery({ id: "delivery-pending", state: "pending", destinationName: "Pending sink" }),
    ]);

    expect(listedDestinations()).toEqual([
      "Failed sink",
      "Running sink",
      "Pending sink",
      "Succeeded sink",
      "Silenced sink",
    ]);
  });

  it("shows the error text in full and keeps it in the title for the rest", () => {
    const lastError = "connect ECONNREFUSED 10.0.0.12:443 while sending the card";

    renderTable([delivery({ id: "delivery-failed", state: "failed", lastError })]);

    expect(screen.getByText(lastError)).toBeTruthy();
    expect(screen.getByTitle(lastError)).toBeTruthy();
  });

  it("explains a silenced delivery in place and links the rule that did it", () => {
    const suppressReason = "Maintenance window matched destination in [destination-1]";

    renderTable([
      delivery({
        id: "delivery-suppressed",
        state: "suppressed",
        suppressReason,
        suppressionId: "suppression-1",
      }),
    ]);

    expect(screen.getByText(suppressReason)).toBeTruthy();
    expect(screen.getByTitle(suppressReason)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/suppressions/$suppressionId/suppression-1",
    );
  });

  it("keeps the reason snapshot when the rule has been deleted", () => {
    const suppressReason = "Maintenance window matched destination in [destination-1]";

    renderTable([
      delivery({
        id: "delivery-suppressed",
        state: "suppressed",
        suppressReason,
        suppressionId: null,
      }),
    ]);

    expect(screen.getByText(suppressReason)).toBeTruthy();
    expect(screen.getByText("Rule deleted")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("falls back to the shared dash for deliveries that were not silenced", () => {
    renderTable([delivery({ id: "delivery-succeeded", state: "succeeded" })]);

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows the date for a retry that falls on a later day", () => {
    renderTable([
      delivery({
        id: "delivery-pending",
        state: "pending",
        nextAttemptAt: "2030-01-01T00:00:00.000Z",
      }),
    ]);

    const retryCell = screen.getAllByRole("cell")[4];

    expect(retryCell?.textContent).toContain("2030");
  });
});

function listedDestinations() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
}

function renderTable(deliveries: EventDetailData["deliveries"]) {
  return render(
    <AppIntlProvider locale="en-US">
      <EventDetailDeliveriesTable deliveries={deliveries} />
    </AppIntlProvider>,
  );
}

function delivery(
  overrides: Partial<EventDetailData["deliveries"][number]> = {},
): EventDetailData["deliveries"][number] {
  return {
    id: "delivery-1",
    state: "failed",
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastError: null,
    destinationName: "Feishu on-call",
    destinationKind: "feishu",
    routeName: "Critical checkout",
    ...overrides,
  } as EventDetailData["deliveries"][number];
}
