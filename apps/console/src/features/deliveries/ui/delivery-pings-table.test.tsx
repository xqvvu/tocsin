// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { OncallPing } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryPingsTable } from "#/features/deliveries/ui/delivery-pings-table";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ format, value }: { format: string; value: string }) => (
    <span data-format={format}>{value}</span>
  ),
}));

const now = new Date("2026-10-21T09:00:00.000Z");

describe("delivery pings table", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows who initiated a manual page and the call timeline", () => {
    renderTable(
      detailFixture([
        pingFixture({
          trigger: "manual",
          initiatedBy: "user-1",
          firedAt: "2026-10-19T01:02:00.000Z",
          nextAttemptAt: "2026-10-19T01:07:00.000Z",
          state: "running",
        }),
      ]),
    );

    expect(screen.getByText("Call fired")).toBeTruthy();
    expect(screen.getByText("Next retry")).toBeTruthy();
    expect(screen.getByText("Manual")).toBeTruthy();
    expect(screen.getByText("Initiated by user-1")).toBeTruthy();
    expect(screen.getByText("2026-10-19T01:02:00.000Z")).toBeTruthy();
    expect(screen.getByText("2026-10-19T01:07:00.000Z")).toBeTruthy();
  });

  it("keeps the date on a retry that lands on another day", () => {
    renderTable(detailFixture([pingFixture({ nextAttemptAt: "2026-10-24T01:07:00.000Z" })]));

    expect(screen.getByText("2026-10-24T01:07:00.000Z").getAttribute("data-format")).toBe(
      "dateTime",
    );
  });

  it("shows only the clock time for a retry later the same day", () => {
    renderTable(detailFixture([pingFixture({ nextAttemptAt: "2026-10-21T14:07:00.000Z" })]));

    expect(screen.getByText("2026-10-21T14:07:00.000Z").getAttribute("data-format")).toBe("time");
  });

  it("leaves the timeline empty for an automatic page that has not fired", () => {
    renderTable(detailFixture([pingFixture({ trigger: "auto" })]));

    expect(screen.getByText("Auto")).toBeTruthy();
    expect(screen.queryByText(/Initiated by/)).toBeNull();
    // Call fired, next retry and last error all fall back to the shared dash.
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("explains the first gate that stopped automatic paging instead of an empty table", () => {
    renderTable(
      detailFixture([], {
        destinationMetadata: {
          sendMode: "app",
          urgentAutoEnabled: false,
          urgentReceiverCount: 2,
          urgentSeverities: ["critical"],
        },
      }),
    );

    expect(screen.getByText("Why no automatic paging")).toBeTruthy();
    expect(screen.getByText(/Automatic paging is off for this destination/)).toBeTruthy();
    expect(screen.getByText(/Based on the destination's current configuration/)).toBeTruthy();
    expect(screen.queryByText("No urgent calls for this delivery")).toBeNull();
  });

  it("names the destination kind when it is not Feishu at all", () => {
    renderTable(
      detailFixture([], {
        destination: {
          id: "destination-1",
          name: "Ops webhook",
          kind: "generic_webhook",
          enabled: true,
        },
      }),
    );

    expect(screen.getByText(/This delivery's destination is not Feishu/)).toBeTruthy();
  });
});

function renderTable(detail: DeliveryDetailData): void {
  render(
    <AppIntlProvider locale="en-US" now={now} timeZone="UTC">
      <DeliveryPingsTable detail={detail} />
    </AppIntlProvider>,
  );
}

function detailFixture(
  pings: OncallPing[],
  overrides: Partial<DeliveryDetailData> = {},
): DeliveryDetailData {
  return {
    job: {
      id: "delivery-1",
      eventId: "event-1",
      destinationId: "destination-1",
      routeId: null,
      state: "succeeded",
      attemptCount: 1,
      maxAttempts: 5,
      nextAttemptAt: null,
      lastError: null,
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      createdAt: "2026-10-19T01:00:00.000Z",
      updatedAt: "2026-10-19T01:00:05.000Z",
      finishedAt: "2026-10-19T01:00:05.000Z",
    },
    event: {
      id: "event-1",
      sourceId: "source-1",
      normalized: {
        title: "Disk almost full",
        message: "disk usage 92%",
        severity: "critical",
        status: "firing",
        fingerprint: "disk-full",
        labels: {},
        occurredAt: "2026-10-19T01:00:00.000Z",
      },
      rawPayload: {},
      rawHeaders: {},
      receivedAt: "2026-10-19T01:00:00.000Z",
      providerMetadata: {},
    },
    source: { id: "source-1", name: "Prometheus", provider: "prometheus", enabled: true },
    destination: { id: "destination-1", name: "Ops group", kind: "feishu", enabled: true },
    destinationMetadata: {},
    route: null,
    renderedPayload: null,
    providerReference: { type: "feishu_message_id", value: "om_abc123" },
    attempts: [],
    pings,
    ...overrides,
  } as unknown as DeliveryDetailData;
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
