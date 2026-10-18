// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryAttempt } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliverySummaryTab } from "#/features/deliveries/ui/delivery-summary-tab";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

describe("delivery summary tab", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows queue, send, and end-to-end time next to the raw timestamps", () => {
    renderSummary(
      detailFixture({
        createdAt: "2026-10-12T10:00:00.000Z",
        finishedAt: "2026-10-12T10:00:20.000Z",
      }),
      [
        attemptFixture({
          startedAt: "2026-10-12T10:00:05.000Z",
          finishedAt: "2026-10-12T10:00:08.000Z",
        }),
      ],
    );

    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy();
    expect(screen.getByText("Queue wait")).toBeTruthy();
    expect(screen.getByText("Send time")).toBeTruthy();
    expect(screen.getByText("End-to-end")).toBeTruthy();
    expect(screen.getByText("5.0s")).toBeTruthy();
    expect(screen.getByText("3.0s")).toBeTruthy();
    expect(screen.getByText("20.0s")).toBeTruthy();
  });

  it("falls back to a dash while the delivery has no finished attempt", () => {
    renderSummary(detailFixture({ createdAt: "2026-10-12T10:00:00.000Z", finishedAt: null }), []);

    expect(screen.queryByText("Send time")).toBeTruthy();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(3);
  });
});

function renderSummary(detail: DeliveryDetailData, attempts: DeliveryAttempt[]): void {
  render(
    <AppIntlProvider locale="en-US">
      <DeliverySummaryTab detail={{ ...detail, attempts }} />
    </AppIntlProvider>,
  );
}

function detailFixture(overrides: {
  createdAt: string;
  finishedAt: string | null;
}): DeliveryDetailData {
  return {
    job: {
      id: "delivery-1",
      eventId: "event-1",
      destinationId: "destination-1",
      routeId: "route-1",
      state: overrides.finishedAt ? "succeeded" : "pending",
      attemptCount: 1,
      maxAttempts: 5,
      nextAttemptAt: null,
      lastError: null,
      suppressionId: null,
      suppressedAt: null,
      suppressReason: null,
      createdAt: overrides.createdAt,
      updatedAt: overrides.createdAt,
      finishedAt: overrides.finishedAt,
    },
    event: {
      id: "event-1",
      sourceId: "source-1",
      normalized: {
        title: "Disk almost full",
        message: "disk usage 92%",
        severity: "warning",
        status: "firing",
        fingerprint: "disk-full",
        labels: {},
        fields: {},
        links: [],
      },
      rawPayload: {},
      rawHeaders: {},
      receivedAt: overrides.createdAt,
      providerMetadata: {},
    },
    source: { id: "source-1", name: "Prometheus", provider: "prometheus", enabled: true },
    destination: { id: "destination-1", name: "Ops group", kind: "feishu", enabled: true },
    destinationMetadata: {},
    route: null,
    renderedPayload: null,
    providerReference: null,
    attempts: [],
    pings: [],
  } as unknown as DeliveryDetailData;
}

function attemptFixture(overrides: Partial<DeliveryAttempt> = {}): DeliveryAttempt {
  return {
    id: "attempt-1",
    deliveryId: "delivery-1",
    attemptNumber: 1,
    state: "succeeded",
    responseStatus: 200,
    responseBody: null,
    error: null,
    startedAt: "2026-10-12T10:00:05.000Z",
    finishedAt: "2026-10-12T10:00:08.000Z",
    ...overrides,
  };
}
