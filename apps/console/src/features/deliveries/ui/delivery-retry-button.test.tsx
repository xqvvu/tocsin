// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    render(<DeliveryRetryButton id="delivery-1" state="failed" lastError={null} />);
    fireEvent.click(retryButtonFixture());

    await waitFor(() => {
      expect(testState.retryDelivery).toHaveBeenCalledExactlyOnceWith({ id: "delivery-1" });
    });
    expect(testState.toast.success).toHaveBeenCalledWith("deliveries.detail.retry.successTitle");
    expect(testState.invalidateOperations).toHaveBeenCalled();
  });

  it("stays hidden for a delivery that cannot be retried", () => {
    render(<DeliveryRetryButton id="delivery-1" state="succeeded" lastError={null} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(testState.retryDelivery).not.toHaveBeenCalled();
  });

  it("shows the reason instead of the action when the destination already accepted the alert", () => {
    render(
      <DeliveryRetryButton
        id="delivery-1"
        state="failed"
        lastError={DELIVERY_ACCEPTED_UNRECORDED_ERROR}
      />,
    );

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

    render(<DeliveryRetryButton id="delivery-1" state="failed" lastError={null} />);
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

    render(<DeliveryRetryButton id="delivery-1" state="failed" lastError={null} />);
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
