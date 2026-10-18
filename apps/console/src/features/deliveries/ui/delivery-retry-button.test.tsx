// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
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

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

describe("delivery retry button", () => {
  beforeEach(() => {
    testState.retryDelivery.mockReset().mockResolvedValue({});
    testState.invalidateOperations.mockReset().mockResolvedValue();
    testState.toast.success.mockReset();
    testState.toast.error.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("re-queues a failed delivery and refreshes operations", async () => {
    render(<DeliveryRetryButton detail={detailFixture("failed")} />);
    fireEvent.click(retryButtonFixture());

    await waitFor(() => {
      expect(testState.retryDelivery).toHaveBeenCalledExactlyOnceWith({ id: "delivery-1" });
    });
    expect(testState.toast.success).toHaveBeenCalledWith("deliveries.detail.retry.successTitle");
    expect(testState.invalidateOperations).toHaveBeenCalled();
  });

  it("stays hidden for a delivery that cannot be retried", () => {
    render(<DeliveryRetryButton detail={detailFixture("succeeded")} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(testState.retryDelivery).not.toHaveBeenCalled();
  });

  it("disables the action while the retry is in flight", async () => {
    let resolveRetry: (() => void) | undefined;
    const retryPromise = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });
    testState.retryDelivery.mockReturnValueOnce(retryPromise);

    render(<DeliveryRetryButton detail={detailFixture("failed")} />);
    const button = retryButtonFixture();
    fireEvent.click(button);

    await waitFor(() => {
      expect(button.disabled).toBe(true);
    });

    resolveRetry?.();

    await waitFor(() => {
      expect(testState.invalidateOperations).toHaveBeenCalled();
    });
  });

  it("surfaces a refused retry as an error toast", async () => {
    testState.retryDelivery.mockRejectedValueOnce(new Error("delivery is not failed"));

    render(<DeliveryRetryButton detail={detailFixture("failed")} />);
    fireEvent.click(retryButtonFixture());

    await waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith(
        "deliveries.detail.retry.failureTitle",
        expect.objectContaining({ description: "delivery is not failed" }),
      );
    });
    expect(testState.invalidateOperations).not.toHaveBeenCalled();
  });
});

function retryButtonFixture(): HTMLButtonElement {
  return screen.getByRole("button") as HTMLButtonElement;
}

function detailFixture(state: string): DeliveryDetailData {
  return {
    job: { id: "delivery-1", state },
  } as unknown as DeliveryDetailData;
}
