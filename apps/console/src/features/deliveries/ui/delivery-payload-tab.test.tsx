// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

  it("tells the operator when the retained raw payload will be pruned", async () => {
    renderTab({
      rawPayload: { title: "Disk almost full", value: 92 },
      renderedPayload: { text: "Disk usage is 92%" },
    });

    const note = await screen.findByRole("note");

    expect(note.textContent).toContain("Raw payload retained until");
    expect(note.textContent).toContain("2026-11-26T00:00:00.000Z");
  });

  it("does not promise a window once the raw payload is already pruned", () => {
    renderTab({
      rawPayloadPruned: true,
      rawPayload: { retentionPruned: true },
      renderedPayload: { text: "Disk usage is 92%" },
    });

    expect(screen.queryByRole("note")).toBeNull();
  });
});

function renderTab(overrides: {
  rawPayloadPruned?: boolean;
  rawPayload: unknown;
  renderedPayload: unknown;
}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppIntlProvider locale="en-US" now={NOW}>
        <DeliveryPayloadTab detail={detailFixture(overrides)} />
      </AppIntlProvider>
    </QueryClientProvider>,
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
      receivedAt: RECEIVED_AT,
    },
    renderedPayload: overrides.renderedPayload,
  } as unknown as DeliveryDetailData;
}
