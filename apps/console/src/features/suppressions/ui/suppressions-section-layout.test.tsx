// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Suppression } from "@tocsin/core";

import { SuppressionsSection } from "#/features/suppressions/ui/suppressions-section";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

const noop = () => {};

describe("suppressions section layout", () => {
  afterEach(() => cleanup());

  it("fills the remaining dashboard height like the routes table", () => {
    const { container } = render(
      <AppIntlProvider locale="en-US">
        <div className="flex h-dvh flex-col">
          <SuppressionsSection
            suppressions={[]}
            sources={[]}
            destinations={[]}
            editingSuppression={null}
            pending={false}
            hasActiveFilters={false}
            onResetFilters={noop}
            onEdit={noop}
            onCancelEdit={noop}
            onToggle={noop}
            onDelete={noop}
            onSubmitEdit={noop}
          />
        </div>
      </AppIntlProvider>,
    );

    const section = container.querySelector("section.bg-background");
    const table = container.querySelector("table");
    const tableRegion = table?.parentElement?.parentElement;

    // OperationsTable is already flex-1/min-h-0. The feature wrapper must also
    // participate in the flex chain, or the table shrink-wraps to its rows and
    // leaves an unused blank area above the dashboard footer.
    expect(section?.className).toContain("flex-1");
    expect(section?.className).toContain("min-h-0");
    expect(section?.className).toContain("flex-col");
    expect(tableRegion?.className).toContain("flex-1");
    expect(tableRegion?.className).toContain("min-h-0");
  });

  it("names the suppression in its toggle control instead of showing a raw key", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SuppressionsSection
          suppressions={[
            suppressionFixture({ enabled: true, name: "Nightly maintenance" }),
            suppressionFixture({ id: "sup-2", enabled: false, name: "Legacy silence" }),
          ]}
          sources={[]}
          destinations={[]}
          editingSuppression={null}
          pending={false}
          hasActiveFilters={false}
          onResetFilters={noop}
          onEdit={noop}
          onCancelEdit={noop}
          onToggle={noop}
          onDelete={noop}
          onSubmitEdit={noop}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByRole("button", { name: "Disable Nightly maintenance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable Legacy silence" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /disableTitle|enableTitle/ })).toBeNull();
  });
});

function suppressionFixture({
  id = "sup-1",
  name,
  enabled,
}: {
  id?: string;
  name: string;
  enabled: boolean;
}): Suppression {
  return {
    id,
    name,
    kind: "maintenance_window",
    enabled,
    reason: null,
    matcher: {
      sourceIds: [],
      destinationIds: [],
      severities: [],
      statuses: [],
      fingerprints: [],
      labels: [],
      titleContains: [],
      messageContains: [],
    },
    startsAt: "2026-10-20T00:00:00.000Z",
    endsAt: "2026-10-21T00:00:00.000Z",
    createdBy: null,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
  };
}
