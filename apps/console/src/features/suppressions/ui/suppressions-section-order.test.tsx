// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

describe("suppressions section ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T10:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders in-force rules above scheduled, disabled and expired rules", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SuppressionsSection
          suppressions={[
            suppressionFixture({
              id: "expired",
              name: "Yesterday",
              startsAt: "2026-10-18T07:00:00.000Z",
              endsAt: "2026-10-18T08:00:00.000Z",
            }),
            suppressionFixture({ id: "disabled", name: "Switched off", enabled: false }),
            suppressionFixture({
              id: "scheduled",
              name: "Tonight",
              startsAt: "2026-10-19T20:00:00.000Z",
              endsAt: "2026-10-19T22:00:00.000Z",
            }),
            suppressionFixture({ id: "active", name: "In force" }),
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

    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelector("td")?.textContent ?? "");

    expect(names[0]).toContain("In force");
    expect(names[1]).toContain("Tonight");
    expect(names[2]).toContain("Switched off");
    expect(names[3]).toContain("Yesterday");
  });
});

function suppressionFixture({
  id,
  name,
  enabled = true,
  startsAt = "2026-10-19T09:00:00.000Z",
  endsAt = "2026-10-19T11:00:00.000Z",
}: {
  id: string;
  name: string;
  enabled?: boolean;
  startsAt?: string;
  endsAt?: string;
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
    startsAt,
    endsAt,
    createdBy: null,
    createdAt: "2026-10-19T08:00:00.000Z",
    updatedAt: "2026-10-19T08:00:00.000Z",
  };
}
