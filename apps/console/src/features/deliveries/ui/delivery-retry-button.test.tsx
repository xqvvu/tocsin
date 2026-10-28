// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DELIVERY_ACCEPTED_UNRECORDED_ERROR } from "@tocsin/core";

import { DeliveryRetryButton } from "#/features/deliveries/ui/delivery-retry-button";

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

vi.mock("#/features/operations/api/operations.queries", () => ({
  deliveryRetryPreviewQueryOptions: (deliveryId: string) => ({
    queryKey: ["test", "retry-preview", deliveryId],
    queryFn: async () => ({
      deliveryId,
      urgentPaging: { destinations: [], deliveryCount: 0, receiverCount: 0 },
    }),
    staleTime: Infinity,
  }),
}));

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

describe("delivery retry button", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.retryDelivery.mockReset().mockResolvedValue({});
    testState.invalidateOperations.mockReset().mockResolvedValue();
    testState.toast.success.mockReset();
    testState.toast.error.mockReset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("confirms before re-queuing a failed delivery", async () => {
    renderButton();

    fireEvent.click(retryButtonFixture());

    expect(testState.retryDelivery).not.toHaveBeenCalled();
    expect(screen.getByText("deliveries.retry.confirm.title")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "deliveries.retry.confirm.confirm" }));

    await waitFor(() => {
      expect(testState.retryDelivery).toHaveBeenCalledExactlyOnceWith({ id: "delivery-1" });
    });
    expect(testState.toast.success).toHaveBeenCalledWith("deliveries.detail.retry.successTitle");
    expect(testState.invalidateOperations).toHaveBeenCalled();
  });

  it("does not retry when the operator cancels", async () => {
    renderButton();

    fireEvent.click(retryButtonFixture());
    fireEvent.click(screen.getByRole("button", { name: "common.actions.cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("deliveries.retry.confirm.title")).toBeNull();
    });
    expect(testState.retryDelivery).not.toHaveBeenCalled();
  });

  it("stays hidden for a delivery that cannot be retried", () => {
    renderButton({ state: "succeeded" });

    expect(screen.queryByRole("button")).toBeNull();
    expect(testState.retryDelivery).not.toHaveBeenCalled();
  });

  it("shows the reason instead of the action when the destination already accepted the alert", () => {
    renderButton({ lastError: DELIVERY_ACCEPTED_UNRECORDED_ERROR });

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("deliveries.detail.retry.blockedByAccepted")).toBeTruthy();
    expect(testState.retryDelivery).not.toHaveBeenCalled();
  });

  it("disables the action while the retry is in flight", async () => {
    let resolveRetry: (() => void) | undefined;
    const retryPromise = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });
    testState.retryDelivery.mockReturnValueOnce(retryPromise);

    renderButton();
    fireEvent.click(retryButtonFixture());
    fireEvent.click(screen.getByRole("button", { name: "deliveries.retry.confirm.confirm" }));

    await waitFor(() => {
      expect(retryButtonFixture().disabled).toBe(true);
    });

    resolveRetry?.();

    await waitFor(() => {
      expect(testState.invalidateOperations).toHaveBeenCalled();
    });
  });

  it("surfaces a refused retry as an error toast", async () => {
    testState.retryDelivery.mockRejectedValueOnce(new Error("delivery is not failed"));

    renderButton();
    fireEvent.click(retryButtonFixture());
    fireEvent.click(screen.getByRole("button", { name: "deliveries.retry.confirm.confirm" }));

    await waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith(
        "deliveries.detail.retry.failureTitle",
        expect.objectContaining({ description: "delivery is not failed" }),
      );
    });
    expect(testState.invalidateOperations).not.toHaveBeenCalled();
  });

  function renderButton(
    overrides: {
      state?: "failed" | "succeeded";
      lastError?: string | null;
    } = {},
  ) {
    const node: ReactNode = (
      <DeliveryRetryButton
        id="delivery-1"
        state={overrides.state ?? "failed"}
        lastError={overrides.lastError ?? null}
        destinationName="Ops group"
        attemptCount={2}
        maxAttempts={3}
      />
    );

    return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  }
});

function retryButtonFixture(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: "deliveries.detail.retry.action",
  }) as HTMLButtonElement;
}
