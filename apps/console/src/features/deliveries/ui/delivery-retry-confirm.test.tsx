// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryRetryPreview, UrgentPagingImpact } from "@tocsin/core";

import { DeliveryRetryConfirmContent } from "#/features/deliveries/ui/delivery-retry-confirm";
import { AppIntlProvider } from "#/i18n/provider";

const testState = vi.hoisted(() => ({
  preview: (): Promise<DeliveryRetryPreview> => new Promise(() => {}),
}));

vi.mock("#/features/operations/api/operations.queries", () => ({
  deliveryRetryPreviewQueryOptions: (deliveryId: string) => ({
    queryKey: ["test", "retry-preview", deliveryId],
    queryFn: () => testState.preview(),
  }),
}));

// The confirmation is one of three dialogs that mount this content; the
// dialog wrapper itself is covered by its own entry points, so the unit here
// only has to observe which state the content picks.
vi.mock("#/components/ui/alert-dialog", () => ({
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogAction: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

const impact: UrgentPagingImpact = {
  deliveryCount: 1,
  receiverCount: 2,
  destinations: [
    { destinationId: "destination-1", destinationName: "Primary on-call", receiverCount: 2 },
  ],
};

function previewWith(value: UrgentPagingImpact): DeliveryRetryPreview {
  return { deliveryId: "delivery-1", urgentPaging: value };
}

function renderConfirm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onConfirm = vi.fn();

  render(
    <QueryClientProvider client={client}>
      <AppIntlProvider locale="en-US">
        <DeliveryRetryConfirmContent
          deliveryId="delivery-1"
          destinationName="Primary on-call"
          attempt={1}
          maxAttempts={3}
          pending={false}
          onConfirm={onConfirm}
        />
      </AppIntlProvider>
    </QueryClientProvider>,
  );

  return { onConfirm };
}

describe("delivery retry confirmation", () => {
  afterEach(() => {
    cleanup();
    testState.preview = () => new Promise(() => {});
  });

  it("says the preview is still loading instead of staying silent", () => {
    renderConfirm();

    // Silence used to be indistinguishable from the resolved "no calls" answer.
    expect(screen.getByRole("status").textContent).toContain(
      "Checking whether this retry can place urgent calls",
    );
    expect(screen.getByRole("button", { name: "Retry now" })).toBeDefined();
  });

  it("says the preview failed and still lets the retry through", async () => {
    testState.preview = () => Promise.reject(new Error("preview unavailable"));
    const { onConfirm } = renderConfirm();

    // The loading line is replaced by the failure line, not left as-is.
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Urgent call preview unavailable"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("names the calls once the preview resolves", async () => {
    testState.preview = async () => previewWith(impact);
    renderConfirm();

    const note = await screen.findByRole("note");

    expect(note.textContent).toContain("A successful retry may call 2 receivers");
    expect(note.textContent).toContain("Primary on-call ×2");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays quiet when the preview resolves with no calls", async () => {
    testState.preview = async () =>
      previewWith({ deliveryCount: 1, receiverCount: 0, destinations: [] });
    renderConfirm();

    // The resolved query must replace the loading line rather than add to it.
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());

    expect(screen.queryByRole("note")).toBeNull();
  });
});
