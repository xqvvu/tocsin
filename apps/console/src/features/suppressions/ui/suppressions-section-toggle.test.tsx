// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

describe("suppression toggle confirmation", () => {
  afterEach(() => cleanup());

  it("discloses resuming delivery before disabling an active rule", () => {
    const onToggle = vi.fn<(suppression: Suppression) => void>();

    renderSection({
      suppressions: [suppressionFixture({ name: "Nightly maintenance", window: "active" })],
      onToggle,
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable Nightly maintenance" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Disable this suppression?")).toBeTruthy();
    expect(
      within(dialog).getByText(/Nightly maintenance.*stops silencing immediately/),
    ).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Disable suppression" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps the rule untouched when the operator cancels", () => {
    const onToggle = vi.fn<(suppression: Suppression) => void>();

    renderSection({
      suppressions: [suppressionFixture({ name: "Nightly maintenance", window: "active" })],
      onToggle,
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable Nightly maintenance" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep current state" }));

    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("warns that enabling an in-window rule silences alerts immediately", () => {
    const onToggle = vi.fn<(suppression: Suppression) => void>();

    renderSection({
      suppressions: [
        suppressionFixture({
          name: "Legacy silence",
          enabled: false,
          window: "active",
        }),
      ],
      onToggle,
    });

    fireEvent.click(screen.getByRole("button", { name: "Enable Legacy silence" }));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Legacy silence.*starts silencing immediately/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Enable suppression" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("tells the operator that enabling an expired rule has no effect", () => {
    const onToggle = vi.fn<(suppression: Suppression) => void>();

    renderSection({
      suppressions: [
        suppressionFixture({
          name: "Legacy silence",
          enabled: false,
          window: "expired",
        }),
      ],
      onToggle,
    });

    fireEvent.click(screen.getByRole("button", { name: "Enable Legacy silence" }));

    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText(
        /Legacy silence.*enabling it has no effect, edit the end time first/,
      ),
    ).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("says a scheduled rule will never start when it is disabled", () => {
    renderSection({
      suppressions: [suppressionFixture({ name: "Change freeze", window: "scheduled" })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable Change freeze" }));

    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText(/Change freeze.*will no longer take effect when its window opens/),
    ).toBeTruthy();
  });

  it("discloses resuming delivery before deleting an active rule", () => {
    renderSection({
      suppressions: [suppressionFixture({ name: "Nightly maintenance", window: "active" })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Nightly maintenance" }));

    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText(/Nightly maintenance.*stops silencing immediately.*resume delivery/),
    ).toBeTruthy();
  });

  it("keeps the plain delete copy for a rule that is not silencing anything", () => {
    renderSection({
      suppressions: [suppressionFixture({ name: "Nightly maintenance", window: "expired" })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Nightly maintenance" }));

    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText(/Nightly maintenance.*stops matching immediately/),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/resume delivery/)).toBeNull();
  });
});

function renderSection({
  suppressions,
  onToggle = noop,
}: {
  suppressions: Suppression[];
  onToggle?: (suppression: Suppression) => void;
}) {
  render(
    <AppIntlProvider locale="en-US">
      <SuppressionsSection
        suppressions={suppressions}
        sources={[]}
        destinations={[]}
        editingSuppression={null}
        pending={false}
        hasActiveFilters={false}
        onResetFilters={noop}
        onEdit={noop}
        onCancelEdit={noop}
        onToggle={onToggle}
        onDelete={noop}
        onSubmitEdit={noop}
      />
    </AppIntlProvider>,
  );
}

function suppressionFixture({
  name,
  enabled = true,
  window,
}: {
  name: string;
  enabled?: boolean;
  window: "active" | "scheduled" | "expired";
}): Suppression {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const [startsAtMs, endsAtMs] =
    window === "active"
      ? [now - hour, now + hour]
      : window === "scheduled"
        ? [now + hour, now + 2 * hour]
        : [now - 2 * hour, now - hour];

  return {
    id: `sup-${window}`,
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
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    createdBy: null,
    createdAt: new Date(now - 3 * hour).toISOString(),
    updatedAt: new Date(now - 3 * hour).toISOString(),
  };
}
