// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

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
      screen.getByPlaceholderText(
        "title, message, fingerprint, label, upstream metadata, ID, error, destination, route, or external reference",
      ),
    ).toBeTruthy();
  });

  it("keeps the event search placeholder scoped to event fields", () => {
    renderFilters("events", {}, "toolbar");

    expect(
      screen.getByPlaceholderText("title, message, fingerprint, label, upstream metadata, or ID"),
    ).toBeTruthy();
  });

  it("caps the search input at the contract limit", () => {
    renderFilters("events", {}, "toolbar");

    const input = screen.getByPlaceholderText(
      "title, message, fingerprint, label, upstream metadata, or ID",
    );

    expect((input as HTMLInputElement).maxLength).toBe(OPERATION_SEARCH_MAX_LENGTH);
  });
});

describe("operation search input", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps a burst of typing local and commits it once", async () => {
    const onChange = vi.fn<(next: Partial<DashboardOperationSearch>) => void>();
    renderFilters("events", {}, "toolbar", onChange);
    const input = screen.getByPlaceholderText(
      "title, message, fingerprint, label, upstream metadata, or ID",
    ) as HTMLInputElement;

    // Each change is one keystroke as React sees it. The old input wrote every
    // key to the URL, which both re-trimmed the value and queried per key.
    for (const value of ["D", "Di", "Dis", "Disk", "Disk ", "Disk u", "Disk usage"]) {
      fireEvent.change(input, { target: { value } });
    }

    expect(input.value).toBe("Disk usage");
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({ q: "Disk usage" });
  });

  it("clears an uncommitted draft when the active query chip is removed", async () => {
    const onChange = vi.fn<(next: Partial<DashboardOperationSearch>) => void>();
    renderFilters("events", { q: "checkout" }, "toolbar", onChange);
    const input = screen.getByPlaceholderText(
      "title, message, fingerprint, label, upstream metadata, or ID",
    ) as HTMLInputElement;

    // Still inside the debounce window: the URL does not know about "now" yet.
    fireEvent.change(input, { target: { value: "checkout now" } });
    fireEvent.click(screen.getByTitle("Clear Search"));

    expect(input.value).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: "" });
  });

  it("adopts an external reset instead of the uncommitted draft", async () => {
    const onChange = vi.fn<(next: Partial<DashboardOperationSearch>) => void>();
    const { rerender } = renderFilters("events", { q: "checkout" }, "toolbar", onChange);
    const input = screen.getByPlaceholderText(
      "title, message, fingerprint, label, upstream metadata, or ID",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "checkout now" } });
    expect(input.value).toBe("checkout now");

    // Reset filters clears the URL value before the debounce fires.
    rerender(filtersTree("events", {}, "toolbar", onChange));

    const reset = screen.getByPlaceholderText(
      "title, message, fingerprint, label, upstream metadata, or ID",
    ) as HTMLInputElement;
    expect(reset.value).toBe("");

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(onChange).not.toHaveBeenCalled();
  });
});

function renderFilters(
  scope: OperationFilterScope,
  search: DashboardOperationSearch = {},
  // The rail renders the panel inline; the toolbar keeps the panel inside a
  // closed popover but always renders the active-filter chips.
  layout: "rail" | "toolbar" = "rail",
  onChange: (next: Partial<DashboardOperationSearch>) => void = () => {},
) {
  return render(filtersTree(scope, search, layout, onChange));
}

function filtersTree(
  scope: OperationFilterScope,
  search: DashboardOperationSearch,
  layout: "rail" | "toolbar",
  onChange: (next: Partial<DashboardOperationSearch>) => void,
) {
  return (
    <AppIntlProvider locale="en-US">
      <OperationFilters
        configuration={configuration}
        scope={scope}
        search={search}
        pending={false}
        onChange={onChange}
        layout={layout}
      />
    </AppIntlProvider>
  );
}
