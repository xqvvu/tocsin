// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { SuppressionImpactOutput } from "@tocsin/api";

import { SuppressionImpactPanel } from "#/features/suppressions/ui/suppression-impact-panel";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

describe("suppression impact panel", () => {
  afterEach(() => {
    cleanup();
  });

  it("summarises the silenced volume, its window, and the busiest destinations", () => {
    renderPanel(impactFixture());

    expect(screen.getByText("Impact")).toBeTruthy();
    expect(termValue("Silenced notifications")).toBe("4");
    expect(termValue("Alerts affected")).toBe("3");
    expect(termValue("Sources")).toBe("2");
    expect(termValue("Destinations")).toBe("2");
    expect(screen.getByText("2026-10-12T09:00:00.000Z")).toBeTruthy();
    expect(screen.getByText("2026-10-12T09:20:00.000Z")).toBeTruthy();
    // The severity split names the band, not the raw enum.
    expect(screen.getByText("Critical").parentElement?.textContent).toContain("3");
    expect(screen.getByText("Warning").parentElement?.textContent).toContain("1");
    expect(screen.getByText("Primary webhook")).toBeTruthy();
    expect(screen.getByText("Generic webhook")).toBeTruthy();
    expect(screen.getByText("On-call Feishu")).toBeTruthy();
    expect(screen.getByText("Feishu")).toBeTruthy();
  });

  it("explains an empty window instead of rendering zeroed cards", () => {
    renderPanel({
      deliveryCount: 0,
      eventCount: 0,
      sourceCount: 0,
      destinationCount: 0,
      firstHitAt: null,
      lastHitAt: null,
      severities: [],
      destinations: [],
    });

    expect(screen.getByText("Nothing silenced in this window")).toBeTruthy();
    expect(screen.queryByText("Silenced notifications")).toBeNull();
    expect(screen.queryByText("By destination")).toBeNull();
  });

  it("counts the destinations the panel had to leave out", () => {
    renderPanel({
      ...impactFixture(),
      destinationCount: 10,
      destinations: Array.from({ length: 8 }, (_, index) => ({
        destinationId: `destination-${index}`,
        destinationName: `Target ${index}`,
        kind: "generic_webhook" as const,
        deliveryCount: 10 - index,
      })),
    });

    expect(screen.getByText("2 more destinations not shown")).toBeTruthy();
  });
});

function renderPanel(impact: SuppressionImpactOutput): void {
  render(
    <AppIntlProvider locale="en-US">
      <SuppressionImpactPanel impact={impact} />
    </AppIntlProvider>,
  );
}

/** The value cell next to a term in the panel's definition grid. */
function termValue(label: string): string | null | undefined {
  return screen.getByText(label).parentElement?.querySelector("dd")?.textContent;
}

function impactFixture(): SuppressionImpactOutput {
  return {
    deliveryCount: 4,
    eventCount: 3,
    sourceCount: 2,
    destinationCount: 2,
    firstHitAt: "2026-10-12T09:00:00.000Z",
    lastHitAt: "2026-10-12T09:20:00.000Z",
    severities: [
      { severity: "critical", deliveryCount: 3 },
      { severity: "warning", deliveryCount: 1 },
    ],
    destinations: [
      {
        destinationId: "dest-1",
        destinationName: "Primary webhook",
        kind: "generic_webhook",
        deliveryCount: 3,
      },
      {
        destinationId: "dest-2",
        destinationName: "On-call Feishu",
        kind: "feishu",
        deliveryCount: 1,
      },
    ],
  };
}
