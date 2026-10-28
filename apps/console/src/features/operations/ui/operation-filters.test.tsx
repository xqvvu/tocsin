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

const EVENT_SEARCH_PLACEHOLDER =
  "title, message, fingerprint, idempotency key, label, upstream metadata, or ID (space-separated terms must all match)";
const DELIVERY_SEARCH_PLACEHOLDER =
  "title, message, fingerprint, idempotency key, label, upstream metadata, ID, error from any attempt, destination, route, or external reference (space-separated terms must all match)";

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

    // Source, severity, status, destination, and the time window all exist in
    // the events query; route, destination kind, and delivery state do not.
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Severity")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    // The fan-out outcome ("did this alert reach anyone") belongs to the event
    // list; the delivery list has the exact per-job state instead.
    expect(screen.getByText("Delivery outcome")).toBeTruthy();
    expect(screen.getByText("Time range")).toBeTruthy();
    expect(screen.getByText("Destination")).toBeTruthy();
    // The match control only means something once a destination is selected.
    expect(screen.queryByText("Destination delivery")).toBeNull();
    expect(screen.queryByText("Destination kind")).toBeNull();
    expect(screen.queryByText("Route")).toBeNull();
    expect(screen.queryByText("Delivery state")).toBeNull();
    expect(screen.queryByText("Receipt")).toBeNull();
    expect(screen.queryByText("Attempts")).toBeNull();
    // The time basis only changes how the delivery list is windowed.
    expect(screen.queryByText("Time basis")).toBeNull();
  });

  it("reveals the destination match only after a destination is chosen", () => {
    renderFilters("events", { destinationId: "destination-1" });
    expect(screen.getByText("Destination delivery")).toBeTruthy();

    cleanup();
    renderFilters("events", { destinationId: "" });
    expect(screen.queryByText("Destination delivery")).toBeNull();
  });

  it("shows every filter on the deliveries page", () => {
    renderFilters("deliveries");

    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Destination")).toBeTruthy();
    expect(screen.getByText("Destination kind")).toBeTruthy();
    expect(screen.getByText("Route")).toBeTruthy();
    expect(screen.getByText("Delivery state")).toBeTruthy();
    expect(screen.queryByText("Delivery outcome")).toBeNull();
    // The destination match is an event question ("did this alert reach that
    // target"), not a per-job one.
    expect(screen.queryByText("Destination delivery")).toBeNull();
    expect(screen.getByText("Receipt")).toBeTruthy();
    expect(screen.getByText("Attempts")).toBeTruthy();
    expect(screen.getByText("Time range")).toBeTruthy();
    expect(screen.getByText("Time basis")).toBeTruthy();
  });

  it("names the attempt-count chip and keeps it off the events page", () => {
    renderFilters("deliveries", { minAttempts: 2 }, "toolbar");
    expect(screen.getByTitle("Clear Attempts")).toBeTruthy();

    cleanup();
    renderFilters("events", { minAttempts: 2 }, "toolbar");
    expect(screen.queryByTitle("Clear Attempts")).toBeNull();
  });

  it("names the delivery outcome chip and keeps it off the deliveries page", () => {
    renderFilters("events", { deliveryOutcome: "none" }, "toolbar");
    expect(screen.getByTitle("Clear Delivery outcome")).toBeTruthy();
    expect(screen.getByText("No delivery")).toBeTruthy();

    cleanup();
    renderFilters("deliveries", { deliveryOutcome: "none" }, "toolbar");
    expect(screen.queryByTitle("Clear Delivery outcome")).toBeNull();
  });

  it("names the destination kind chip and keeps it off the events page", () => {
    renderFilters("deliveries", { destinationKind: "feishu" }, "toolbar");
    expect(screen.getByTitle("Clear Destination kind")).toBeTruthy();

    cleanup();
    renderFilters("events", { destinationKind: "feishu" }, "toolbar");
    expect(screen.queryByTitle("Clear Destination kind")).toBeNull();
  });

  it("clears every delivery filter from the inline reset", () => {
    // The inline reset sits next to the chips. It must clear the same keys as
    // the page-level reset, or the destination kind survives a "reset" and
    // keeps filtering the table.
    const onChange = vi.fn<(next: Partial<DashboardOperationSearch>) => void>();
    renderFilters(
      "deliveries",
      {
        sourceId: "source-1",
        severity: "critical",
        status: "firing",
        destinationId: "destination-1",
        destinationKind: "feishu",
        routeId: "route-1",
        eventId: "evt-1",
        receipt: "present",
        deliveryState: "failed",
        minAttempts: 2,
        range: "1h",
        rangeAnchor: "2026-10-23T04:00:00.000Z",
        q: "checkout",
      },
      "toolbar",
      onChange,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      sourceId: "",
      severity: "",
      status: "",
      deliveryOutcome: "",
      destinationId: "",
      destinationKind: "",
      destinationMatch: "",
      routeId: "",
      eventId: "",
      fingerprint: "",
      receipt: "",
      deliveryState: "",
      minAttempts: 0,
      range: "",
      timeField: "",
      rangeAnchor: "",
      rangeUntil: "",
      q: "",
    });
  });

  it("names the pinned lower bound on the time range chip", () => {
    // A shared link with an anchor describes a fixed window; the chip has to say
    // which one, or readers cannot tell it apart from a live "last hour".
    renderFilters("events", { range: "1h", rangeAnchor: "2026-10-23T04:00:00.000Z" }, "toolbar");

    expect(screen.getByTitle("Clear Time range")).toBeTruthy();
    expect(screen.getByText("Last hour · from 10/23, 04:00")).toBeTruthy();
  });

  it("names the frozen paging bound on its own chip", () => {
    // A list that stopped moving reads as broken during an incident; the chip is
    // the only thing that explains why, and its clear button is the way back to
    // a live list.
    renderFilters("events", { rangeUntil: "2026-10-23T04:00:00.000Z" }, "toolbar");

    expect(screen.getByTitle("Clear Result set frozen")).toBeTruthy();
    expect(screen.getByText("paging from 10/23, 04:00")).toBeTruthy();
  });

  it("keeps the plain window label when the link has no anchor", () => {
    renderFilters("events", { range: "1h" }, "toolbar");

    expect(screen.getByText("Last hour")).toBeTruthy();
    expect(screen.queryByText(/· from/)).toBeNull();
  });

  it("keeps the destination chip honest and hides delivery-only chips on events", () => {
    // A hand-written URL can still carry all three keys. Destination now
    // filters the event list, so it earns a chip; route and delivery state
    // still do nothing there and must not pretend otherwise.
    renderFilters(
      "events",
      {
        destinationId: "destination-1",
        routeId: "route-1",
        deliveryState: "failed",
      },
      "toolbar",
    );

    expect(screen.getByTitle("Clear Destination")).toBeTruthy();
    expect(screen.queryByTitle("Clear Route")).toBeNull();
    expect(screen.queryByTitle("Clear Delivery state")).toBeNull();
  });

  it("names the fingerprint chip on both pages", () => {
    // The recurrence tab links to both lists so an operator can leave its
    // five-row cap without retyping the fingerprint into the substring search
    // box. Both destinations carry the same exact-fingerprint rule, so both
    // must show the chip the reader needs in order to clear it.
    renderFilters("events", { fingerprint: "checkout:unavailable" }, "toolbar");

    expect(screen.getByTitle("Clear Fingerprint")).toBeTruthy();
    expect(screen.getByText("checkout:unavailable")).toBeTruthy();

    cleanup();
    renderFilters("deliveries", { fingerprint: "checkout:unavailable" }, "toolbar");

    expect(screen.getByTitle("Clear Fingerprint")).toBeTruthy();
    expect(screen.getByText("checkout:unavailable")).toBeTruthy();
  });

  it("names the destination match chip on the events page", () => {
    renderFilters(
      "events",
      { destinationId: "destination-1", destinationMatch: "missing" },
      "toolbar",
    );

    expect(screen.getByTitle("Clear Destination delivery")).toBeTruthy();
    expect(screen.getByText("No delivery to destination")).toBeTruthy();
  });

  it("names the route chip on the deliveries page", () => {
    renderFilters("deliveries", { routeId: "route-1" }, "toolbar");

    expect(screen.getByTitle("Clear Route")).toBeTruthy();
  });

  it("names the event chip on the deliveries page", () => {
    // The events table links a count badge here; without the chip the list is
    // narrowed to one event with no visible way to widen it again.
    renderFilters("deliveries", { eventId: "evt-1" }, "toolbar");

    expect(screen.getByTitle("Clear Event")).toBeTruthy();
    expect(screen.getByText("evt-1")).toBeTruthy();

    cleanup();
    renderFilters("events", { eventId: "evt-1" }, "toolbar");
    expect(screen.queryByTitle("Clear Event")).toBeNull();
  });

  it("names the last-activity basis chip and keeps it off the events page", () => {
    renderFilters("deliveries", { timeField: "updated" }, "toolbar");

    expect(screen.getByTitle("Clear Time basis")).toBeTruthy();
    expect(screen.getByText("Updated")).toBeTruthy();

    cleanup();
    renderFilters("events", { timeField: "updated" }, "toolbar");
    expect(screen.queryByTitle("Clear Time basis")).toBeNull();
  });

  it("does not render a chip for the default time basis", () => {
    // A hand-edited `timeField=created` narrows nothing; a chip would claim the
    // list is filtered and send the operator looking for a filter that is off.
    renderFilters("deliveries", { timeField: "created" }, "toolbar");

    expect(screen.queryByTitle("Clear Time basis")).toBeNull();
  });

  it("tells screen readers that a chip removes its filter", () => {
    renderFilters("deliveries", { timeField: "updated" }, "toolbar");

    // The visible text is "Time basis Updated"; the accessible name must name
    // the action, not just repeat the value.
    expect(screen.getByRole("button", { name: "Clear Time basis" })).toBeTruthy();
  });

  it("names the receipt chip on the deliveries page", () => {
    renderFilters("deliveries", { receipt: "missing" }, "toolbar");

    expect(screen.getByTitle("Clear Receipt")).toBeTruthy();
    expect(screen.getByText("No receipt")).toBeTruthy();

    cleanup();
    renderFilters("events", { receipt: "missing" }, "toolbar");
    expect(screen.queryByTitle("Clear Receipt")).toBeNull();
  });

  it("advertises the extra delivery search fields on the deliveries page", () => {
    renderFilters("deliveries", {}, "toolbar");

    expect(screen.getByPlaceholderText(DELIVERY_SEARCH_PLACEHOLDER)).toBeTruthy();
  });

  it("keeps the event search placeholder scoped to event fields", () => {
    renderFilters("events", {}, "toolbar");

    expect(screen.getByPlaceholderText(EVENT_SEARCH_PLACEHOLDER)).toBeTruthy();
  });

  it("caps the search input at the contract limit", () => {
    renderFilters("events", {}, "toolbar");

    const input = screen.getByPlaceholderText(EVENT_SEARCH_PLACEHOLDER);

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
    const input = screen.getByPlaceholderText(EVENT_SEARCH_PLACEHOLDER) as HTMLInputElement;

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

  it("warns when a pasted query exceeds the applied term cap", () => {
    renderFilters("events", {}, "toolbar");
    const input = screen.getByPlaceholderText(EVENT_SEARCH_PLACEHOLDER) as HTMLInputElement;
    const applied = "a b c d e f g h";

    // At the cap every term still applies, so there is nothing to warn about.
    fireEvent.change(input, { target: { value: applied } });
    expect(screen.queryByText(/ignores/)).toBeNull();

    fireEvent.change(input, { target: { value: `${applied} i j` } });
    expect(
      screen.getByText(
        "Search applies the first 8 terms and ignores 2 more, so remove extra terms for precise results",
      ),
    ).toBeTruthy();

    // Trimming back into the cap removes the warning again.
    fireEvent.change(input, { target: { value: applied } });
    expect(screen.queryByText(/ignores/)).toBeNull();
  });

  it("clears an uncommitted draft when the active query chip is removed", async () => {
    const onChange = vi.fn<(next: Partial<DashboardOperationSearch>) => void>();
    renderFilters("events", { q: "checkout" }, "toolbar", onChange);
    const input = screen.getByPlaceholderText(EVENT_SEARCH_PLACEHOLDER) as HTMLInputElement;

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
    const input = screen.getByPlaceholderText(EVENT_SEARCH_PLACEHOLDER) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "checkout now" } });
    expect(input.value).toBe("checkout now");

    // Reset filters clears the URL value before the debounce fires.
    rerender(filtersTree("events", {}, "toolbar", onChange));

    const reset = screen.getByPlaceholderText(EVENT_SEARCH_PLACEHOLDER) as HTMLInputElement;
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
