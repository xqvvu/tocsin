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
          hasActiveFilters={false}
          onInspect={vi.fn<(eventId: string) => void>()}
          onPageChange={onPageChange}
          onResetFilters={vi.fn<() => void>()}
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
          hasActiveFilters={false}
          onInspect={vi.fn<(eventId: string) => void>()}
          onPageChange={vi.fn<(page: number) => void>()}
          onResetFilters={vi.fn<() => void>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No route matched")).toBeTruthy();
  });

  it("hides the pagination bar when there are no events at all", () => {
    render(
      <AppIntlProvider locale="en-US">
        <EventsTable
          events={[]}
          page={1}
          pageSize={20}
          total={0}
          pending={false}
          hasActiveFilters={false}
          onInspect={vi.fn<(eventId: string) => void>()}
          onPageChange={vi.fn<(page: number) => void>()}
          onResetFilters={vi.fn<() => void>()}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No events yet")).toBeTruthy();
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("separates an empty stream from filters that match nothing", () => {
    const onResetFilters = vi.fn<() => void>();

    const { rerender } = render(
      <AppIntlProvider locale="en-US">
        <EventsTable
          events={[]}
          page={1}
          pageSize={20}
          total={0}
          pending={false}
          hasActiveFilters={false}
          onInspect={vi.fn<(eventId: string) => void>()}
          onPageChange={vi.fn<(page: number) => void>()}
          onResetFilters={onResetFilters}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No events yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear filters and show all events" })).toBeNull();

    rerender(
      <AppIntlProvider locale="en-US">
        <EventsTable
          events={[]}
          page={1}
          pageSize={20}
          total={0}
          pending={false}
          hasActiveFilters
          onInspect={vi.fn<(eventId: string) => void>()}
          onPageChange={vi.fn<(page: number) => void>()}
          onResetFilters={onResetFilters}
        />
      </AppIntlProvider>,
    );

    expect(screen.getByText("No events match")).toBeTruthy();
    expect(screen.queryByText("No events yet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters and show all events" }));

    expect(onResetFilters).toHaveBeenCalledTimes(1);
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
    parseFailed: false,
    deliveryCounts: {
      pending: 0,
      running: 0,
      succeeded: 1,
      failed: 0,
      suppressed: 0,
    },
  };
}
