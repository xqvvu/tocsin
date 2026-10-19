// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationSummary, RouteDefinition } from "@tocsin/core";

import { RoutesSection } from "#/features/routes/ui/routes-section";
import { AppIntlProvider } from "#/i18n/provider";

const noop = () => {};

const route: RouteDefinition = {
  id: "route-1",
  name: "Critical alerts",
  enabled: true,
  rule: {
    sourceIds: ["source-1", "source-2"],
    severities: ["critical", "warning"],
    statuses: ["firing", "unknown"],
    labels: [
      { key: "team", operator: "equals", value: "sre" },
      { key: "service", operator: "contains", value: "api" },
    ],
    titleContains: ["LatencyHigh", "DiskFull"],
    messageContains: ["timeout", "volume"],
  },
  destinationIds: ["destination-1"],
};

const enabledDestination: DestinationSummary = {
  id: "destination-1",
  name: "Pager",
  kind: "generic_webhook",
  enabled: true,
};

function renderSection(
  destinations: DestinationSummary[] = [enabledDestination],
  onToggle: () => void = noop,
) {
  return render(
    <AppIntlProvider locale="en-US">
      <div className="flex h-dvh flex-col">
        <RoutesSection
          routes={[route]}
          sources={[
            { id: "source-1", name: "Grafana", provider: "grafana", enabled: true } as never,
            {
              id: "source-2",
              name: "Alertmanager",
              provider: "alertmanager",
              enabled: true,
            } as never,
          ]}
          destinations={destinations}
          editingRoute={null}
          pending={false}
          onEdit={noop}
          onCancelEdit={noop}
          onPreviewReplay={noop}
          onToggle={onToggle}
          onDelete={noop}
          onSubmitEdit={noop}
        />
      </div>
    </AppIntlProvider>,
  );
}

describe("routes section table layout", () => {
  afterEach(() => cleanup());

  it("fills the available column height like the other list tables", () => {
    const { container } = renderSection();
    const table = container.querySelector("table");
    const tableRegion = table?.parentElement?.parentElement;
    const section = table?.closest("section");

    // OperationsTable itself is flex-1. The feature wrapper must also be flex-1
    // or it shrink-wraps around the table and leaves a blank block underneath —
    // the height mismatch the routes page had.
    expect(section?.className).toContain("flex-1");
    expect(section?.className).toContain("min-h-0");
    expect(tableRegion?.className).toContain("flex-1");
    expect(tableRegion?.className).toContain("min-h-0");
  });

  it("keeps a many-condition rule to one row and retains the full tooltip", () => {
    const { container } = renderSection();
    const rule = container.querySelector('[title*="Sources: 2"]');

    expect(rule, "rule summary container missing").not.toBeNull();
    expect(rule!.className).toContain("flex-nowrap");
    expect(rule!.className).toContain("overflow-hidden");
    expect(rule!.className).not.toContain("flex-wrap");
    expect(rule!.getAttribute("title")).toContain("Message contains: timeout, volume");
    expect(rule!.querySelectorAll("[data-slot=badge]").length).toBe(12);
  });

  it("marks a target list that includes a disabled destination", () => {
    renderSection([{ ...enabledDestination, enabled: false }]);

    // A disabled target still receives enqueued deliveries, but the worker
    // cannot claim them; the route list must not look fully operational.
    expect(screen.getByText("1 disabled")).toBeTruthy();
  });

  it("leaves a fully enabled target list unmarked", () => {
    renderSection();

    expect(screen.queryByText("1 disabled")).toBeNull();
  });

  it("asks for confirmation before disabling a route", () => {
    const onToggle = vi.fn<() => void>();
    renderSection([enabledDestination], onToggle);

    fireEvent.click(screen.getByRole("button", { name: "Disable route matching" }));
    expect(onToggle).not.toHaveBeenCalled();

    const disableDialog = screen.getByRole("alertdialog");
    expect(within(disableDialog).getByText(/targets 1 destinations/)).toBeTruthy();
    fireEvent.click(within(disableDialog).getByRole("button", { name: "Disable route matching" }));

    expect(onToggle).toHaveBeenCalledWith(route);
  });
});
