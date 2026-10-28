// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { UrgentPagingImpact } from "@tocsin/core";

import { DeliveryRetryAction } from "#/features/deliveries/ui/delivery-retry-action";
import type { Operations } from "#/features/operations/model/operation-types";

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key}:${Object.values(values).join("|")}`,
}));

// The confirmation previews the urgent calls a successful retry could place.
// These tests care about the copy and the gate, not the transport.
const testState = vi.hoisted(() => ({
  urgentPaging: {
    destinations: [],
    deliveryCount: 0,
    receiverCount: 0,
  } as UrgentPagingImpact,
}));

vi.mock("#/features/operations/api/operations.queries", () => ({
  deliveryRetryPreviewQueryOptions: (deliveryId: string) => ({
    queryKey: ["test", "retry-preview", deliveryId],
    queryFn: async () => ({ deliveryId, urgentPaging: testState.urgentPaging }),
    staleTime: Infinity,
  }),
}));

// Tooltips need a provider that this unit test does not mount; the trigger's
// aria-label still names the action.
vi.mock("#/components/common/icon-tooltip", () => ({
  IconTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("delivery retry action", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.urgentPaging = { destinations: [], deliveryCount: 0, receiverCount: 0 };
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("asks first and names the destination and attempt budget", () => {
    const onRetry = vi.fn();

    renderAction(
      <DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={onRetry} />,
    );
    fireEvent.click(retryTrigger());

    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByText("deliveries.retry.confirm.title")).toBeTruthy();
    expect(screen.getByText("deliveries.retry.confirm.description:Ops group|2|3")).toBeTruthy();
  });

  it("retries only after the operator confirms", () => {
    const onRetry = vi.fn();

    renderAction(
      <DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={onRetry} />,
    );
    fireEvent.click(retryTrigger());
    fireEvent.click(screen.getByRole("button", { name: "deliveries.retry.confirm.confirm" }));

    expect(onRetry).toHaveBeenCalledExactlyOnceWith("delivery-1");
  });

  it("does not retry when the operator cancels", () => {
    const onRetry = vi.fn();

    renderAction(
      <DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={onRetry} />,
    );
    fireEvent.click(retryTrigger());
    fireEvent.click(screen.getByRole("button", { name: "common.actions.cancel" }));

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("warns about the urgent calls a successful retry could place", async () => {
    testState.urgentPaging = {
      destinations: [
        { destinationId: "destination-1", destinationName: "Primary on-call", receiverCount: 3 },
      ],
      deliveryCount: 1,
      receiverCount: 3,
    };

    renderAction(
      <DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={() => {}} />,
    );
    fireEvent.click(retryTrigger());

    await waitFor(() => {
      expect(screen.getByRole("note").textContent).toContain(
        "operations.urgentPaging.retryTitle:3",
      );
    });
    expect(screen.getByRole("note").textContent).toContain("Primary on-call ×3");
  });

  it("stays silent when the destination would not page anyone", async () => {
    renderAction(
      <DeliveryRetryAction delivery={deliveryRow()} pending={false} onRetry={() => {}} />,
    );
    fireEvent.click(retryTrigger());

    // Wait for the preview to settle so the assertion is not passing merely
    // because the query has not resolved yet.
    await waitFor(() => {
      expect(screen.getByText("deliveries.retry.confirm.title")).toBeTruthy();
    });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("disables the trigger while a request is pending", () => {
    renderAction(<DeliveryRetryAction delivery={deliveryRow()} pending onRetry={() => {}} />);

    expect(retryTrigger().disabled).toBe(true);
  });

  function renderAction(node: React.ReactNode) {
    return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  }
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
