// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EventsPageToolbar } from "#/features/events/ui/events-page-toolbar";
import { AppIntlProvider } from "#/i18n/provider";

describe("events page toolbar", () => {
  afterEach(cleanup);

  it("opens the deliveries list with the shared filters", () => {
    const onViewDeliveries = vi.fn<() => void>();
    renderToolbar({ onViewDeliveries });

    fireEvent.click(screen.getByRole("button", { name: "View matching deliveries" }));

    expect(onViewDeliveries).toHaveBeenCalledTimes(1);
  });

  it("hides the cross-list action when nothing is shared", () => {
    // With only event-specific filters there is nothing to carry over, and the
    // sidebar already links to Deliveries; a "matching" label would be a lie.
    renderToolbar({ onViewDeliveries: null });

    expect(screen.queryByRole("button", { name: "View matching deliveries" })).toBeNull();
  });

  it("names the page-level reset distinctly from the filter bar and empty state", () => {
    renderToolbar();

    const reset = screen.getByRole("button", { name: "Reset event filters" });

    expect(reset.textContent).toContain("Reset filters");
    expect(reset.getAttribute("title")).toBe("Reset event filters");
  });
});

function renderToolbar(props: { onViewDeliveries?: (() => void) | null } = {}): void {
  render(
    <AppIntlProvider locale="en-US">
      <EventsPageToolbar
        pending={false}
        onRefresh={vi.fn<() => void>()}
        onResetFilters={vi.fn<() => void>()}
        onViewDeliveries={props.onViewDeliveries}
      />
    </AppIntlProvider>,
  );
}
