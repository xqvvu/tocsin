// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  DeliveryRetryPreview,
  DeliveryRetrySuppression,
  UrgentPagingImpact,
} from "@tocsin/core";

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

// Three dialogs mount this content; none of them decides what it shows. The
// dialog chrome is replaced with plain elements so this test only observes
// which preview state the content renders.
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

const noSuppression: DeliveryRetrySuppression = {
  status: "none",
  suppressionId: null,
  suppressionName: null,
  suppressionKind: null,
  endsAt: null,
};

function previewWith(
  value: UrgentPagingImpact,
  suppression: DeliveryRetrySuppression = noSuppression,
): DeliveryRetryPreview {
  return { deliveryId: "delivery-1", urgentPaging: value, suppression };
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
    // One live region holds every state, so the resolved warning replaces the
    // loading line instead of being added next to it.
    expect(screen.getByRole("status").textContent).not.toContain("Checking whether");
  });

  it("says there are no calls once the preview resolves without any", async () => {
    testState.preview = async () =>
      previewWith({ deliveryCount: 1, receiverCount: 0, destinations: [] });
    renderConfirm();

    // Rendering nothing here read exactly like "never checked": the loading
    // line vanished and left the dialog silent.
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "This retry will not place urgent calls",
      ),
    );

    expect(screen.queryByRole("note")).toBeNull();
  });

  it("names the silence rule that will swallow the retry instead of its calls", async () => {
    testState.preview = async () =>
      previewWith(
        // The server empties the call projection when a rule matches; the
        // dialog must not fall back to "no calls" for a different reason.
        { deliveryCount: 0, receiverCount: 0, destinations: [] },
        {
          status: "matched",
          suppressionId: "suppression-1",
          suppressionName: "Checkout maintenance",
          suppressionKind: "maintenance_window",
          endsAt: "2026-10-29T04:00:00.000Z",
        },
      );
    renderConfirm();

    const note = await screen.findByRole("note");

    expect(note.textContent).toContain("suppressed by rule “Checkout maintenance”");
    expect(note.textContent).toContain("Maintenance window until");
    expect(note.textContent).toContain("may place urgent calls");
    expect(screen.getByRole("status").textContent).not.toContain(
      "This retry will not place urgent calls",
    );
  });

  it("admits it could not check suppression when the event record is gone", async () => {
    testState.preview = async () =>
      previewWith(
        { deliveryCount: 0, receiverCount: 0, destinations: [] },
        {
          status: "unavailable",
          suppressionId: null,
          suppressionName: null,
          suppressionKind: null,
          endsAt: null,
        },
      );
    renderConfirm();

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("suppression cannot be checked"),
    );
  });
});
