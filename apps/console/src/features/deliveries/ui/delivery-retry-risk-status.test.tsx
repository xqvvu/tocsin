// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { DeliveryRetryPreview, DeliveryRetrySuppression } from "@tocsin/core";

import { DeliveryRetryRiskStatus } from "#/features/deliveries/ui/delivery-retry-risk-status";
import { AppIntlProvider } from "#/i18n/provider";

const noSuppression: DeliveryRetrySuppression = {
  status: "none",
  suppressionId: null,
  suppressionName: null,
  suppressionKind: null,
  endsAt: null,
};

const matchedSuppression: DeliveryRetrySuppression = {
  status: "matched",
  suppressionId: "suppression-1",
  suppressionName: "Checkout maintenance",
  suppressionKind: "maintenance_window",
  endsAt: "2026-10-28T12:00:00.000Z",
};

function preview(suppression: DeliveryRetrySuppression): DeliveryRetryPreview {
  return {
    deliveryId: "delivery-1",
    urgentPaging: { destinations: [], deliveryCount: 0, receiverCount: 0 },
    suppression,
  };
}

function renderStatus(value: DeliveryRetryPreview, isPending = false, isError = false) {
  return render(
    <AppIntlProvider locale="en-US">
      <DeliveryRetryRiskStatus isPending={isPending} isError={isError} preview={value} />
    </AppIntlProvider>,
  );
}

describe("delivery retry risk status", () => {
  afterEach(() => {
    cleanup();
  });

  it("reads a matched rule out as one answer instead of paragraph by paragraph", () => {
    renderStatus(preview(matchedSuppression));

    // A matched rule swaps the single muted line for three paragraphs. With a
    // non-atomic region a screen reader may announce each paragraph on its own,
    // which loses the verdict that ties them together.
    const status = screen.getByRole("status");

    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.querySelectorAll("p").length).toBeGreaterThan(1);
  });

  it("keeps every preview state inside the same single live region", () => {
    const { container } = renderStatus(preview(noSuppression));

    // One region per confirmation: two would announce the same answer twice,
    // and a region that only appears with the answer can be skipped entirely.
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);
  });
});
