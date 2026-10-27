// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearedSuppressionSearch,
  type SuppressionListSearch,
} from "#/features/suppressions/model/suppression-search";
import { SuppressionFilters } from "#/features/suppressions/ui/suppression-filters";
import { AppIntlProvider } from "#/i18n/provider";

const SEARCH_PLACEHOLDER = "Search by rule name, reason, or matcher";

function renderFilters(
  search: SuppressionListSearch = {},
  onChange: (next: Partial<SuppressionListSearch>) => void = () => {},
) {
  return render(
    <AppIntlProvider locale="en-US">
      <SuppressionFilters search={search} pending={false} onChange={onChange} />
    </AppIntlProvider>,
  );
}

describe("suppression filters", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers a keyword field and the two rule dimensions", () => {
    renderFilters();

    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeTruthy();
    // The selects show their "any" option until the operator narrows them.
    expect(screen.getAllByText("All states").length).toBeGreaterThan(0);
    expect(screen.getAllByText("All kinds").length).toBeGreaterThan(0);
    // Nothing is narrowed, so there is no chip row to clear.
    expect(screen.queryByText("Clear all filters")).toBeNull();
  });

  it("commits keyword input after a pause so every keystroke avoids the URL", async () => {
    const onChange = vi.fn<(next: Partial<SuppressionListSearch>) => void>();
    renderFilters({}, onChange);
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "checkout " } });

    expect(onChange).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 350));

    // The trailing space survives: it is the operator's text, and only the
    // filter trims it.
    expect(onChange).toHaveBeenCalledWith({ q: "checkout " });
  });

  it("names each active filter and clears only the one that was clicked", () => {
    const onChange = vi.fn<(next: Partial<SuppressionListSearch>) => void>();
    renderFilters({ state: "active", kind: "silence", q: "db" }, onChange);

    expect(screen.getByTitle("Clear State")).toBeTruthy();
    expect(screen.getByTitle("Clear Kind")).toBeTruthy();
    expect(screen.getByTitle("Clear Search rules")).toBeTruthy();
    // The value appears on both the chip and the select; the chip is the one
    // that clears, so assert it through its accessible title above.
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Silence").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle("Clear State"));

    expect(onChange).toHaveBeenCalledWith({ state: "" });
  });

  it("clears every filter through one action", () => {
    const onChange = vi.fn<(next: Partial<SuppressionListSearch>) => void>();
    renderFilters({ state: "expired", kind: "maintenance_window", q: "db" }, onChange);

    fireEvent.click(screen.getByText("Clear all filters"));

    expect(onChange).toHaveBeenCalledWith(clearedSuppressionSearch);
  });
});
