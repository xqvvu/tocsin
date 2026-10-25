// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { NumberedPage } from "@tocsin/core";

import type { DeliveryListItem } from "#/features/operations/model/operation-types";
import { SuppressionHitsTable } from "#/features/suppressions/ui/suppression-hits-table";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ value }: { value: string }) => <span>{value}</span>,
}));

describe("suppression hits table", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the deliveries a rule silenced, distinguishable from failures", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SuppressionHitsTable
          hits={hitsFixture()}
          page={1}
          onPageChange={vi.fn<(page: number) => void>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("Silenced deliveries")).toBeTruthy();
    expect(screen.getByText("Ops group")).toBeTruthy();
    // The event cell carries the alert identity, not just the source name.
    expect(screen.getByText("Disk full")).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("Firing")).toBeTruthy();
    expect(screen.getByText("Prometheus")).toBeTruthy();
    expect(screen.getByText("event-1")).toBeTruthy();
    // The state column renders the shared badge; a raw enum would say "suppressed".
    expect(screen.getByText("Suppressed")).toBeTruthy();
    expect(screen.queryByText("Failed")).toBeNull();
  });

  it("explains an empty hit list instead of rendering a blank table", () => {
    render(
      <AppIntlProvider locale="en-US">
        <SuppressionHitsTable
          hits={{ items: [], total: 0, page: 1, pageSize: 20 }}
          page={1}
          onPageChange={vi.fn<(page: number) => void>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("Nothing silenced yet")).toBeTruthy();
  });
});

function hitsFixture(): NumberedPage<DeliveryListItem> {
  return {
    items: [
      {
        id: "delivery-1",
        eventId: "event-1",
        eventTitle: "Disk full",
        eventSeverity: "critical",
        eventStatus: "firing",
        sourceName: "Prometheus",
        destinationName: "Ops group",
        destinationKind: "feishu",
        routeName: "Critical alerts",
        providerReference: null,
        state: "suppressed",
        attemptCount: 0,
        nextAttemptAt: null,
        lastError: null,
        createdAt: "2026-10-12T10:00:00.000Z",
        updatedAt: "2026-10-12T10:00:00.000Z",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  };
}
