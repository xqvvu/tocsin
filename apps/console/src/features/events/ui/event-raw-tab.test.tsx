// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

vi.mock("#/features/configuration/api/configuration.queries", () => ({
  appSettingsQueryOptions: () => ({
    queryKey: ["test", "app-settings"],
    queryFn: async () => ({ rawPayloadRetentionDays: 30 }),
    staleTime: Infinity,
  }),
}));

// The retention line decides its sentence from settings plus `receivedAt`; the
// timestamp itself is client-only and time-zone aware, so it renders its ISO
// value here.
vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <time dateTime={value}>{value}</time>,
}));

const NOW = new Date("2026-10-28T00:00:00.000Z");
const RECEIVED_AT = "2026-10-27T00:00:00.000Z";

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

  it("tells the operator when the retained payload will be pruned", async () => {
    renderTab(false);

    const note = await screen.findByRole("note");

    expect(note.textContent).toContain("Raw payload retained until");
    expect(note.textContent).toContain("2026-11-26T00:00:00.000Z");
    expect(note.textContent).toContain("30-day policy, pruned lazily in the background");
  });
});

function renderTab(rawPayloadPruned: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppIntlProvider locale="en-US" now={NOW}>
        <EventRawTab detail={detailFixture(rawPayloadPruned)} />
      </AppIntlProvider>
    </QueryClientProvider>,
  );
}

function detailFixture(rawPayloadPruned: boolean): EventDetailData {
  return {
    rawPayloadPruned,
    event: {
      rawPayload: rawPayloadPruned ? { retentionPruned: true } : { title: "Fresh alert" },
      rawHeaders: {},
      receivedAt: RECEIVED_AT,
    },
  } as unknown as EventDetailData;
}
