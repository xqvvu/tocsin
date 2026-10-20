// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveryDestinationEditAction } from "#/features/deliveries/ui/delivery-destination-edit-action";
import { operationsQueryKeys } from "#/features/operations/api/operations.queries";

const testState = vi.hoisted(() => ({
  loaderProps: null as null | {
    destinationId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved?: () => void | Promise<void>;
  },
}));

vi.mock("#/features/destinations/ui/destination-edit-dialog-loader", () => ({
  DestinationEditDialogLoader: (props: {
    destinationId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved?: () => void | Promise<void>;
  }) => {
    testState.loaderProps = props;

    if (!props.open) {
      return null;
    }

    return (
      <div data-testid="destination-editor">
        <span data-testid="destination-id">{props.destinationId}</span>
        <button
          type="button"
          onClick={() => {
            void props.onSaved?.();
          }}
        >
          mock-save
        </button>
      </div>
    );
  },
}));

vi.mock("#/i18n/use-i18n", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("delivery destination edit action", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.loaderProps = null;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  function renderAction(state: "failed" | "succeeded") {
    return render(
      <QueryClientProvider client={queryClient}>
        <DeliveryDestinationEditAction
          deliveryId="delivery-1"
          destinationId="destination-1"
          state={state}
        />
      </QueryClientProvider>,
    );
  }

  it("opens the destination editor from a failed delivery", () => {
    renderAction("failed");

    expect(testState.loaderProps?.destinationId).toBe("destination-1");
    expect(testState.loaderProps?.open).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: "deliveries.detail.editDestination.action" }),
    );

    expect(testState.loaderProps?.open).toBe(true);
    expect(screen.getByTestId("destination-id").textContent).toBe("destination-1");
  });

  it("stays hidden when the delivery cannot be retried", () => {
    renderAction("succeeded");

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("refreshes the current delivery after the destination is saved", () => {
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined as never);

    renderAction("failed");
    fireEvent.click(
      screen.getByRole("button", { name: "deliveries.detail.editDestination.action" }),
    );
    fireEvent.click(screen.getByText("mock-save"));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: operationsQueryKeys.deliveryDetail("delivery-1"),
    });
  });
});
