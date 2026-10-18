// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { EventRawTab } from "#/features/events/ui/event-raw-tab";
import { AppIntlProvider } from "#/i18n/provider";

// The JSON block pulls in the shiki highlighter, which is asynchronous and
// irrelevant here. These tests are about which state the tab renders, so the
// block is replaced by its title.
vi.mock("#/features/events/ui/event-json-block", () => ({
  EventJsonBlock: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe("event raw tab", () => {
  afterEach(() => {
    cleanup();
  });

  it("explains a pruned payload instead of rendering the retention sentinel", () => {
    const { container } = renderTab(true);

    expect(screen.getByText("Raw data was cleared by the retention policy")).toBeTruthy();
    expect(
      screen.getByText(
        "The raw payload and headers were pruned after the configured retention window — normalized fields and deliveries are unaffected",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Raw payload")).toBeNull();
    expect(screen.queryByText("Raw headers")).toBeNull();
    // The persistence sentinel must never reach the operator as provider data.
    expect(container.textContent).not.toContain("retentionPruned");
  });

  it("keeps the JSON blocks for an event whose payload was retained", () => {
    renderTab(false);

    expect(screen.getByText("Raw payload")).toBeTruthy();
    expect(screen.getByText("Raw headers")).toBeTruthy();
    expect(screen.queryByText("Raw data was cleared by the retention policy")).toBeNull();
  });
});

function renderTab(rawPayloadPruned: boolean) {
  return render(
    <AppIntlProvider locale="en-US">
      <EventRawTab detail={detailFixture(rawPayloadPruned)} />
    </AppIntlProvider>,
  );
}

function detailFixture(rawPayloadPruned: boolean): EventDetailData {
  return {
    rawPayloadPruned,
    event: {
      rawPayload: rawPayloadPruned ? { retentionPruned: true } : { title: "Fresh alert" },
      rawHeaders: {},
    },
  } as unknown as EventDetailData;
}
