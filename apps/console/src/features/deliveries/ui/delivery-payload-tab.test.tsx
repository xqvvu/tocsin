// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryPayloadTab } from "#/features/deliveries/ui/delivery-payload-tab";
import { AppIntlProvider } from "#/i18n/provider";

// The JSON block pulls in the shiki highlighter, which is asynchronous and
// irrelevant here. These tests are about which payloads the tab pairs, so the
// block renders its title and value without highlighting.
vi.mock("#/features/deliveries/ui/delivery-json-block", () => ({
  DeliveryJsonBlock: ({ title, value }: { title: string; value: unknown }) => (
    <div>
      <span>{title}</span>
      <pre>{JSON.stringify(value)}</pre>
    </div>
  ),
}));

describe("delivery payload tab", () => {
  afterEach(() => {
    cleanup();
  });

  it("pairs the raw alert payload with the payload rendered for the target", () => {
    const { container } = renderTab({
      rawPayload: { title: "Disk almost full", value: 92 },
      renderedPayload: { text: "Disk usage is 92%" },
    });

    expect(screen.getByText("Raw alert payload")).toBeTruthy();
    expect(screen.getByText("Rendered payload")).toBeTruthy();
    expect(container.textContent).toContain("Disk almost full");
    expect(container.textContent).toContain("Disk usage is 92%");
  });

  it("explains a pruned raw payload without hiding the rendered payload", () => {
    const { container } = renderTab({
      rawPayloadPruned: true,
      rawPayload: { retentionPruned: true },
      renderedPayload: { text: "Disk usage is 92%" },
    });

    expect(screen.getByText("Raw payload pruned")).toBeTruthy();
    expect(
      screen.getByText(
        "The retention policy cleared this event's raw payload, the rendered payload is still available",
      ),
    ).toBeTruthy();
    // The persistence sentinel must never reach the operator as provider data.
    expect(container.textContent).not.toContain("retentionPruned");
    expect(screen.queryByText("Raw alert payload")).toBeNull();
    // The rendered payload is stored on the delivery, so the prune does not
    // remove the answer to "what was actually sent".
    expect(screen.getByText("Rendered payload")).toBeTruthy();
    expect(container.textContent).toContain("Disk usage is 92%");
  });
});

function renderTab(overrides: {
  rawPayloadPruned?: boolean;
  rawPayload: unknown;
  renderedPayload: unknown;
}) {
  return render(
    <AppIntlProvider locale="en-US">
      <DeliveryPayloadTab detail={detailFixture(overrides)} />
    </AppIntlProvider>,
  );
}

function detailFixture(overrides: {
  rawPayloadPruned?: boolean;
  rawPayload: unknown;
  renderedPayload: unknown;
}): DeliveryDetailData {
  return {
    rawPayloadPruned: overrides.rawPayloadPruned ?? false,
    event: {
      rawPayload: overrides.rawPayload,
      rawHeaders: {},
    },
    renderedPayload: overrides.renderedPayload,
  } as unknown as DeliveryDetailData;
}
