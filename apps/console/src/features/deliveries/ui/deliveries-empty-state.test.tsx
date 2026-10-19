// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DeliveriesEmptyState } from "#/features/deliveries/ui/deliveries-empty-state";
import { AppIntlProvider } from "#/i18n/provider";

describe("deliveries empty state", () => {
  afterEach(() => {
    cleanup();
  });

  it("says nothing has happened yet when no filter is active", () => {
    render(
      <AppIntlProvider locale="en-US">
        <DeliveriesEmptyState hasActiveFilters={false} onResetFilters={() => {}} />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No deliveries yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull();
  });

  it("says the filters matched nothing and offers a reset when they are active", () => {
    const onResetFilters = vi.fn<() => void>();

    render(
      <AppIntlProvider locale="en-US">
        <DeliveriesEmptyState hasActiveFilters onResetFilters={onResetFilters} />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No deliveries match")).toBeTruthy();
    expect(screen.queryByText("No deliveries yet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });
});
