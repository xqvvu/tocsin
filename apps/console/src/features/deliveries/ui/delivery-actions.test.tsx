// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DELIVERY_ACCEPTED_UNRECORDED_ERROR } from "@tocsin/core";

import { DeliveryActions } from "#/features/deliveries/ui/delivery-actions";
import type { Operations } from "#/features/operations/model/operation-types";

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

// Tooltips need a provider that this unit test does not mount; the labels are
// asserted through the buttons' aria-labels instead.
vi.mock("#/components/common/icon-tooltip", () => ({
  IconTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("delivery row actions", () => {
  afterEach(() => {
    cleanup();
  });

  it("omits retry when the destination already accepted the alert", () => {
    renderActions(
      deliveryRow({
        state: "failed",
        lastError: DELIVERY_ACCEPTED_UNRECORDED_ERROR,
      }),
    );

    expect(screen.queryByRole("button", { name: "deliveries.table.retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "deliveries.table.inspect" })).toBeTruthy();
  });

  it("keeps retry for an ordinary failed delivery", () => {
    renderActions(deliveryRow({ state: "failed", lastError: "connection reset" }));

    expect(screen.getByRole("button", { name: "deliveries.table.retry" })).toBeTruthy();
  });
});

function renderActions(delivery: Operations["deliveries"]["items"][number]): void {
  render(
    <DeliveryActions delivery={delivery} pending={false} onInspect={() => {}} onRetry={() => {}} />,
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
    nextAttemptAt: null,
    lastError: "connection reset",
    createdAt: "2026-10-21T09:55:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
    ...overrides,
  };
}
