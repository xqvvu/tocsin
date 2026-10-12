// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { EventsTable } from "#/features/events/ui/events-table";
import type { Operations } from "#/features/operations/model/operation-types";
import { AppIntlProvider } from "#/i18n/provider";

describe("events table", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses numbered table pagination for server event pages", () => {
    const onPageChange = vi.fn<(page: number) => void>();

    render(
      <AppIntlProvider locale="en-US">
        <EventsTable
          events={[eventFixture("event-1")]}
          page={2}
          pageSize={20}
          total={45}
          pending={false}
          onInspect={vi.fn<(eventId: string) => void>()}
          onPageChange={onPageChange}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("45 events")).toBeTruthy();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Latest" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Older" })).toBeNull();
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("shows unmatched routing state for events without matched routes or deliveries", () => {
    render(
      <AppIntlProvider locale="en-US">
        <EventsTable
          events={[
            {
              ...eventFixture("event-1"),
              routeMatchCount: 0,
              deliveryCounts: {
                pending: 0,
                running: 0,
                succeeded: 0,
                failed: 0,
                suppressed: 0,
              },
            },
          ]}
          page={1}
          pageSize={20}
          total={1}
          pending={false}
          onInspect={vi.fn<(eventId: string) => void>()}
          onPageChange={vi.fn<(page: number) => void>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No route matched")).toBeTruthy();
  });
});

function eventFixture(id: string): Operations["events"]["items"][number] {
  return {
    id,
    sourceId: "source-1",
    sourceName: "Production Grafana",
    severity: "critical",
    status: "firing",
    title: "CPU high",
    fingerprint: "cpu:api",
    receivedAt: "2026-06-06T00:00:00.000Z",
    routeMatchCount: 1,
    deliveryCounts: {
      pending: 0,
      running: 0,
      succeeded: 1,
      failed: 0,
      suppressed: 0,
    },
  };
}
