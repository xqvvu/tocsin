// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveryBuzzButton } from "#/features/deliveries/ui/delivery-buzz-button";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";

const testState = vi.hoisted(() => ({
  buzzDelivery: vi.fn<(input: { id: string }) => Promise<{ pings: unknown[] }>>(),
  invalidateOperations: vi.fn<() => Promise<void>>(),
  toast: {
    success: vi.fn<(title: string, options?: { description?: string }) => void>(),
    error: vi.fn<(title: string, options?: { description?: string }) => void>(),
  },
}));

vi.mock("#/features/operations/api/operation.mutations", () => ({
  useOperationMutations: () => ({
    buzzDelivery: testState.buzzDelivery,
    invalidateOperations: testState.invalidateOperations,
  }),
}));

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key}:${String(values.count)}`,
}));

vi.mock("sonner", () => ({
  toast: testState.toast,
}));

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: () => null,
}));

describe("delivery buzz button", () => {
  beforeEach(() => {
    testState.buzzDelivery.mockReset().mockResolvedValue({ pings: [{ id: "ping-1" }] });
    testState.invalidateOperations.mockReset().mockResolvedValue();
    testState.toast.success.mockReset();
    testState.toast.error.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("pages an app-mode delivery only after the operator confirms the receiver count", async () => {
    render(
      <DeliveryBuzzButton
        detail={detailFixture({ providerReference: reference, urgentReceiverCount: 2 })}
      />,
    );

    const button = buttonFixture();

    expect(button.disabled).toBe(false);
    expect(screen.queryByText("deliveries.detail.buzz.unavailable")).toBeNull();
    expect(screen.queryByText("deliveries.detail.buzz.noReceivers")).toBeNull();

    fireEvent.click(button);

    expect(testState.buzzDelivery).not.toHaveBeenCalled();
    expect(screen.getByText("deliveries.detail.buzz.confirmTitle")).toBeTruthy();
    expect(screen.getByText("deliveries.detail.buzz.confirmDescription:2")).toBeTruthy();

    fireEvent.click(confirmationButton("deliveries.detail.buzz.confirmAction"));

    await waitFor(() => {
      expect(testState.buzzDelivery).toHaveBeenCalledExactlyOnceWith({ id: "delivery-1" });
    });
    expect(testState.toast.success).toHaveBeenCalledWith("deliveries.detail.buzz.successTitle:1");
    expect(testState.invalidateOperations).toHaveBeenCalled();
  });

  it("does not page when the operator cancels the confirmation", async () => {
    render(
      <DeliveryBuzzButton
        detail={detailFixture({ providerReference: reference, urgentReceiverCount: 2 })}
      />,
    );

    fireEvent.click(buttonFixture());

    expect(screen.getByText("deliveries.detail.buzz.confirmTitle")).toBeTruthy();

    fireEvent.click(confirmationButton("deliveries.detail.buzz.cancel"));

    await waitFor(() => {
      expect(screen.queryByText("deliveries.detail.buzz.confirmTitle")).toBeNull();
    });
    expect(testState.buzzDelivery).not.toHaveBeenCalled();
  });

  it("refuses to page a webhook delivery and explains why", () => {
    render(
      <DeliveryBuzzButton
        detail={detailFixture({ providerReference: null, urgentReceiverCount: 0 })}
      />,
    );

    const button = buttonFixture();

    expect(button.disabled).toBe(true);
    expect(screen.getByText("deliveries.detail.buzz.unavailable")).toBeTruthy();

    fireEvent.click(button);

    expect(testState.buzzDelivery).not.toHaveBeenCalled();
  });

  it("disables paging when the destination has no urgent receivers", () => {
    render(
      <DeliveryBuzzButton
        detail={detailFixture({ providerReference: reference, urgentReceiverCount: 0 })}
      />,
    );

    const button = buttonFixture();

    expect(button.disabled).toBe(true);
    expect(screen.getByText("deliveries.detail.buzz.noReceivers")).toBeTruthy();
    expect(screen.queryByText("deliveries.detail.buzz.unavailable")).toBeNull();

    fireEvent.click(button);

    expect(testState.buzzDelivery).not.toHaveBeenCalled();
  });

  it("surfaces a refused page as an error toast", async () => {
    testState.buzzDelivery.mockRejectedValueOnce(new Error("already paged for this alert"));

    render(
      <DeliveryBuzzButton
        detail={detailFixture({ providerReference: reference, urgentReceiverCount: 1 })}
      />,
    );

    fireEvent.click(buttonFixture());
    fireEvent.click(confirmationButton("deliveries.detail.buzz.confirmAction"));

    await waitFor(() => {
      expect(testState.toast.error).toHaveBeenCalledWith(
        "deliveries.detail.buzz.failureTitle",
        expect.objectContaining({ description: "already paged for this alert" }),
      );
    });
  });
});

const reference = { type: "feishu_message_id", value: "om_123" };

function buttonFixture(): HTMLButtonElement {
  return screen.getByRole("button", { name: "deliveries.detail.buzz.action" }) as HTMLButtonElement;
}

function confirmationButton(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function detailFixture(input: {
  providerReference: DeliveryDetailData["providerReference"];
  urgentReceiverCount: number;
}): DeliveryDetailData {
  return {
    job: { id: "delivery-1" },
    providerReference: input.providerReference,
    destinationMetadata: { urgentReceiverCount: input.urgentReceiverCount },
    pings: [],
  } as unknown as DeliveryDetailData;
}
