// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveryRetryAction } from "#/features/deliveries/ui/delivery-retry-action";
import type { Operations } from "#/features/operations/model/operation-types";

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key}:${Object.values(values).join("|")}`,
}));

// Tooltips need a provider that this unit test does not mount; the trigger's
// aria-label still names the action.
vi.mock("#/components/common/icon-tooltip", () => ({
  IconTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("delivery retry action", () => {
  afterEach(() => {
    cleanup();
  });

  it("asks first and names the destination and attempt budget", () => {
    const onRetry = vi.fn();

    render(<DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={onRetry} />);
    fireEvent.click(retryTrigger());

    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByText("deliveries.table.retryConfirm.title")).toBeTruthy();
    expect(
      screen.getByText("deliveries.table.retryConfirm.description:Ops group|2|3"),
    ).toBeTruthy();
  });

  it("retries only after the operator confirms", () => {
    const onRetry = vi.fn();

    render(<DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={onRetry} />);
    fireEvent.click(retryTrigger());
    fireEvent.click(screen.getByRole("button", { name: "deliveries.table.retryConfirm.confirm" }));

    expect(onRetry).toHaveBeenCalledExactlyOnceWith("delivery-1");
  });

  it("does not retry when the operator cancels", () => {
    const onRetry = vi.fn();

    render(<DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={onRetry} />);
    fireEvent.click(retryTrigger());
    fireEvent.click(screen.getByRole("button", { name: "common.actions.cancel" }));

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("disables the trigger while a request is pending", () => {
    render(<DeliveryRetryAction delivery={deliveryRow()} pending onRetry={() => {}} />);

    expect(retryTrigger().disabled).toBe(true);
  });
});

function retryTrigger(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: "deliveries.table.retry",
  }) as HTMLButtonElement;
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
