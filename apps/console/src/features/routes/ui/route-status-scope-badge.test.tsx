// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DestinationSummary, RouteDefinition } from "@tocsin/core";

import { RoutesSection } from "#/features/routes/ui/routes-section";
import { AppIntlProvider } from "#/i18n/provider";

// The queued-delivery count owns its own query-state test; this suite covers
// the status-scope badge in the rule cell.
vi.mock("#/features/operations/ui/queued-deliveries-notice", () => ({
  QueuedDeliveriesNotice: () => null,
}));

const noop = () => {};

const destination: DestinationSummary = {
  id: "destination-1",
  name: "Pager",
  kind: "generic_webhook",
  enabled: true,
};

function route(id: string, statuses: RouteDefinition["rule"]["statuses"]): RouteDefinition {
  return {
    id,
    name: id,
    enabled: true,
    rule: {
      sourceIds: [],
      severities: [],
      statuses,
      labels: [],
      titleContains: [],
      messageContains: [],
    },
    destinationIds: [destination.id],
  };
}

function renderSection(routes: RouteDefinition[]) {
  return render(
    <AppIntlProvider locale="en-US">
      <RoutesSection
        routes={routes}
        sources={[]}
        destinations={[destination]}
        editingRoute={null}
        pending={false}
        onEdit={noop}
        onCancelEdit={noop}
        onPreviewReplay={noop}
        onToggle={noop}
        onDelete={noop}
        onSubmitEdit={noop}
      />
    </AppIntlProvider>,
  );
}

describe("route status scope badge", () => {
  afterEach(() => cleanup());

  it("marks a firing-only route as dropping recovery notifications", () => {
    renderSection([route("firing-only", ["firing"])]);

    const badge = screen.getByText("No resolved");
    expect(badge.getAttribute("title")).toBe(
      "This route does not include Resolved, so recovery notifications are not delivered",
    );
    // Warning tone, not another outline condition chip: the badge states that
    // a notification class is dropped, not a matcher on the rule.
    expect(badge.className).toContain("border-amber-600/30");
    expect(badge.className).toContain("bg-amber-50");
    expect(badge.className).toContain("text-amber-700");
  });

  it("marks a resolved-only route as dropping trigger notifications", () => {
    renderSection([route("resolved-only", ["resolved"])]);

    expect(screen.getByText("No firing")).toBeTruthy();
    expect(screen.queryByText("No resolved")).toBeNull();
  });

  it("marks a route that matches neither notification class", () => {
    renderSection([route("unknown-only", ["unknown"])]);

    expect(screen.getByText("No firing or resolved")).toBeTruthy();
  });

  it("adds no badge when both notification classes are covered", () => {
    renderSection([
      route("both", ["firing", "resolved"]),
      route("unset", []),
      route("firing", ["firing"]),
    ]);

    // Only the partial route carries a badge; the catch-all and dual-state
    // routes stay unmarked.
    expect(screen.getAllByText("No resolved")).toHaveLength(1);
    expect(screen.queryByText("No firing or resolved")).toBeNull();
  });
});
