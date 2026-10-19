// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { OPERATION_SEARCH_MAX_LENGTH, type RouteDefinition } from "@tocsin/core";

import type { DashboardOperationSearch } from "#/features/operations/model/operation-search";
import {
  type OperationFilterScope,
  OperationFilters,
} from "#/features/operations/ui/operation-filters";
import { AppIntlProvider } from "#/i18n/provider";

const configuration = {
  sources: [{ id: "source-1", name: "Grafana", provider: "grafana" as const, enabled: true }],
  destinations: [
    { id: "destination-1", name: "Ops webhook", kind: "generic_webhook" as const, enabled: true },
  ],
  routes: [
    {
      id: "route-1",
      name: "Critical route",
      enabled: true,
      rule: {
        sourceIds: [],
        severities: [],
        statuses: [],
        labels: [],
        titleContains: [],
        messageContains: [],
      },
      destinationIds: ["destination-1"],
    },
  ] satisfies RouteDefinition[],
};

describe("operation filters by page scope", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides delivery-only filters on the events page", () => {
    renderFilters("events");

    // Source, severity, status, and the time window all exist in the events
    // query; destination, route, and delivery state do not.
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Severity")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Time range")).toBeTruthy();
    expect(screen.queryByText("Destination")).toBeNull();
    expect(screen.queryByText("Route")).toBeNull();
    expect(screen.queryByText("Delivery state")).toBeNull();
  });

  it("shows every filter on the deliveries page", () => {
    renderFilters("deliveries");

    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Destination")).toBeTruthy();
    expect(screen.getByText("Route")).toBeTruthy();
    expect(screen.getByText("Delivery state")).toBeTruthy();
    expect(screen.getByText("Time range")).toBeTruthy();
  });

  it("does not surface delivery-only chips on the events page", () => {
    // A hand-written URL can still carry these keys. The events panel must not
    // pretend they filter the table it renders.
    renderFilters(
      "events",
      {
        destinationId: "destination-1",
        routeId: "route-1",
        deliveryState: "failed",
      },
      "toolbar",
    );

    expect(screen.queryByTitle("Clear Destination")).toBeNull();
    expect(screen.queryByTitle("Clear Route")).toBeNull();
    expect(screen.queryByTitle("Clear Delivery state")).toBeNull();
  });

  it("names the route chip on the deliveries page", () => {
    renderFilters("deliveries", { routeId: "route-1" }, "toolbar");

    expect(screen.getByTitle("Clear Route")).toBeTruthy();
  });

  it("advertises the extra delivery search fields on the deliveries page", () => {
    renderFilters("deliveries", {}, "toolbar");

    expect(
      screen.getByPlaceholderText("title, message, fingerprint, ID, error, destination, or route"),
    ).toBeTruthy();
  });

  it("keeps the event search placeholder scoped to event fields", () => {
    renderFilters("events", {}, "toolbar");

    expect(screen.getByPlaceholderText("title, message, fingerprint, or ID")).toBeTruthy();
  });

  it("caps the search input at the contract limit", () => {
    renderFilters("events", {}, "toolbar");

    const input = screen.getByPlaceholderText("title, message, fingerprint, or ID");

    expect((input as HTMLInputElement).maxLength).toBe(OPERATION_SEARCH_MAX_LENGTH);
  });
});

function renderFilters(
  scope: OperationFilterScope,
  search: DashboardOperationSearch = {},
  // The rail renders the panel inline; the toolbar keeps the panel inside a
  // closed popover but always renders the active-filter chips.
  layout: "rail" | "toolbar" = "rail",
) {
  render(
    <AppIntlProvider locale="en-US">
      <OperationFilters
        configuration={configuration}
        scope={scope}
        search={search}
        pending={false}
        onChange={() => {}}
        layout={layout}
      />
    </AppIntlProvider>,
  );
}
