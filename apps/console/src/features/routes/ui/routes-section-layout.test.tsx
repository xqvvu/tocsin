// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationSummary, RouteDefinition } from "@tocsin/core";

import { RoutesSection } from "#/features/routes/ui/routes-section";
import { AppIntlProvider } from "#/i18n/provider";

// The queued-delivery count owns its own query-state test; this suite checks
// how the confirmations scope it to one row, without a query client.
vi.mock("#/features/operations/ui/queued-deliveries-notice", () => ({
  QueuedDeliveriesNotice: ({
    scope,
    description,
  }: {
    scope: { routeId?: string };
    description?: string;
  }) => (
    <div>
      <span data-testid="queued-scope">{scope.routeId}</span>
      {description ? <span data-testid="queued-description">{description}</span> : null}
    </div>
  ),
}));

const noop = () => {};

/** Routes without history still open a delete dialog, just without a gate. */
const noDeletionImpact = async () => ({
  eventCount: 0,
  deliveryCount: 0,
  attemptCount: 0,
  oncallPingCount: 0,
});

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
  routes: RouteDefinition[] = [route],
) {
  return render(
    <AppIntlProvider locale="en-US">
      <div className="flex h-dvh flex-col">
        <RoutesSection
          routes={routes}
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
          requestDeleteImpact={noDeletionImpact}
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

    // OperationsTable fills the column (flex-1) but keeps a height floor: the
    // inline edit form is a flex sibling, and an unfloored table collapsed to
    // 0px and painted its pagination bar over the form header.
    expect(section?.className).toContain("flex-1");
    expect(section?.className).toContain("min-h-72");
    expect(tableRegion?.className).toContain("flex-1");
    expect(tableRegion?.className).toContain("min-h-0");
  });

  it("wraps a many-condition rule into one chip per dimension without clipping", () => {
    const { container } = renderSection();
    const rule = container.querySelector('[title*="Sources: 2"]');

    expect(rule, "rule summary container missing").not.toBeNull();
    // The old cell was a nowrap strip of one badge per value, so a rich rule was
    // squeezed into unreadable stubs. Grouped chips must wrap instead, and the
    // container must not clip what it cannot fit.
    expect(rule!.className).toContain("flex-wrap");
    expect(rule!.className).not.toContain("flex-nowrap");
    expect(rule!.className).not.toContain("overflow-hidden");
    expect(rule!.getAttribute("title")).toContain("Message contains: timeout, volume");
    // Count the condition chips only: the status-scope badge shares the cell
    // but is not a dimension chip.
    expect(rule!.querySelectorAll("[data-rule-chip]").length).toBe(6);

    // Every value stays visible: grouped by dimension, joined in the locale's
    // list separator rather than split into one badge per value.
    expect(screen.getByText("Grafana, Alertmanager")).toBeTruthy();
    expect(screen.getByText("Critical, Warning")).toBeTruthy();
    expect(screen.getByText("Firing, Unknown")).toBeTruthy();
    expect(screen.getByText("team=sre, service~api")).toBeTruthy();
    expect(screen.getByText("LatencyHigh, DiskFull")).toBeTruthy();
    expect(screen.getByText("timeout, volume")).toBeTruthy();
  });

  it("warns when two enabled routes can both notify one destination", () => {
    renderSection([enabledDestination], noop, [
      route,
      { ...route, id: "route-2", name: "Secondary alerts" },
    ]);

    // The dedupe key includes the route id, so these two routes both queue a
    // delivery for the same alert — the operator is paged twice.
    expect(screen.getByText("Routes may notify twice")).toBeTruthy();
    expect(screen.getByText("Critical alerts and Secondary alerts share Pager")).toBeTruthy();
    expect(screen.getAllByText("1 overlaps")).toHaveLength(2);
  });

  it("does not flag a pair that only meets on a disabled destination", () => {
    renderSection([{ ...enabledDestination, enabled: false }], noop, [
      route,
      { ...route, id: "route-2", name: "Secondary alerts" },
    ]);

    // A disabled target never receives a delivery, so it cannot duplicate one.
    expect(screen.queryByText("Routes may notify twice")).toBeNull();
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

  it("offers a one-click silence action on every route row", () => {
    renderSection();

    // Disabling or deleting the route would also stop its matching evidence;
    // the row action mutes what this route delivers without touching it.
    expect(
      screen.getByRole("button", { name: "Silence Critical alerts temporarily" }),
    ).toBeTruthy();
  });

  it("asks for confirmation before disabling a route", () => {
    const onToggle = vi.fn<() => void>();
    renderSection([enabledDestination], onToggle);

    fireEvent.click(screen.getByRole("button", { name: "Disable route matching" }));
    expect(onToggle).not.toHaveBeenCalled();

    const disableDialog = screen.getByRole("alertdialog");
    expect(within(disableDialog).getByText(/targets 1 destinations/)).toBeTruthy();
    expect(within(disableDialog).getByTestId("queued-scope").textContent).toBe("route-1");
    fireEvent.click(within(disableDialog).getByRole("button", { name: "Disable route matching" }));

    expect(onToggle).toHaveBeenCalledWith(route);
  });

  it("confirms before re-enabling a paused route and discloses its queued backlog", () => {
    const onToggle = vi.fn<() => void>();
    const disabledRoute: RouteDefinition = { ...route, enabled: false };
    renderSection([enabledDestination], onToggle, [disabledRoute]);

    // Re-enabling releases every delivery the route held while it was paused,
    // so the row action confirms first instead of toggling on click.
    fireEvent.click(screen.getByRole("button", { name: "Enable route matching" }));
    expect(onToggle).not.toHaveBeenCalled();

    const enableDialog = screen.getByRole("alertdialog");
    expect(within(enableDialog).getByText("Enable route?")).toBeTruthy();
    expect(within(enableDialog).getByText(/lets new events match it again/)).toBeTruthy();
    expect(within(enableDialog).getByTestId("queued-description").textContent).toMatch(
      /released right away/,
    );
    expect(within(enableDialog).getByTestId("queued-scope").textContent).toBe("route-1");

    fireEvent.click(within(enableDialog).getByRole("button", { name: "Enable route matching" }));
    expect(onToggle).toHaveBeenCalledWith(disabledRoute);
  });
});
