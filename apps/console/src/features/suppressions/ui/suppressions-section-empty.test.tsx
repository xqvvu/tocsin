// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SuppressionsSection } from "#/features/suppressions/ui/suppressions-section";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

const noop = () => {};

function renderSection({
  hasActiveFilters,
  onResetFilters = noop,
}: {
  hasActiveFilters: boolean;
  onResetFilters?: () => void;
}) {
  return render(
    <AppIntlProvider locale="en-US">
      <SuppressionsSection
        suppressions={[]}
        sources={[]}
        destinations={[]}
        editingSuppression={null}
        pending={false}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={onResetFilters}
        onEdit={noop}
        onCancelEdit={noop}
        onToggle={noop}
        onDelete={noop}
        onSubmitEdit={noop}
      />
    </AppIntlProvider>,
  );
}

describe("suppressions section empty states", () => {
  afterEach(() => cleanup());

  it("invites the operator to create the first rule when nothing is filtered", () => {
    renderSection({ hasActiveFilters: false });

    expect(screen.getByText("No suppression rules")).toBeTruthy();
    expect(screen.queryByText("No rules match these filters")).toBeNull();
  });

  it("says nothing matched and offers a reset when filters are on", () => {
    const onResetFilters = vi.fn<() => void>();
    renderSection({ hasActiveFilters: true, onResetFilters });

    // An empty filtered list must not read like "no rule protects you": the
    // rule may exist and only be hidden by the current keyword.
    expect(screen.getByText("No rules match these filters")).toBeTruthy();
    expect(screen.queryByText("No suppression rules")).toBeNull();

    fireEvent.click(screen.getByText("Clear all filters"));

    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });
});
