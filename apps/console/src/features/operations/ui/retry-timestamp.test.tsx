// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { RetryTimestamp } from "#/features/operations/ui/retry-timestamp";
import { AppIntlProvider } from "#/i18n/provider";

vi.mock("#/features/operations/ui/operation-timestamp", () => ({
  OperationTimestamp: ({ format, value }: { format: string; value: string }) => (
    <span data-format={format}>{value}</span>
  ),
}));

describe("retry timestamp", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows only the clock time for a retry later the same day", () => {
    renderTimestamp("2026-10-21T14:30:00.000Z", { now: "2026-10-21T09:00:00.000Z" });

    expect(formatOf("2026-10-21T14:30:00.000Z")).toBe("time");
  });

  it("keeps the date when the retry lands on another day", () => {
    renderTimestamp("2026-10-24T02:00:00.000Z", { now: "2026-10-21T09:00:00.000Z" });

    expect(formatOf("2026-10-24T02:00:00.000Z")).toBe("dateTime");
  });

  it("decides the calendar day in the console time zone, not UTC", () => {
    // 23:30Z and 01:00Z are different UTC days but the same Shanghai day.
    renderTimestamp("2026-10-22T01:00:00.000Z", {
      now: "2026-10-21T23:30:00.000Z",
      timeZone: "Asia/Shanghai",
    });

    expect(formatOf("2026-10-22T01:00:00.000Z")).toBe("time");
  });

  it("keeps the date for an unparseable value instead of guessing", () => {
    renderTimestamp("not-a-date", { now: "2026-10-21T09:00:00.000Z" });

    expect(formatOf("not-a-date")).toBe("dateTime");
  });

  it("re-evaluates the calendar day as the console clock advances", () => {
    // The retry is 20 minutes out but still on the next calendar day; the
    // label must drop the date once the clock crosses midnight, which only
    // happens if the shared clock ticks instead of freezing at mount.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T23:50:00.000Z"));

    render(
      <AppIntlProvider locale="en-US" timeZone="UTC">
        <RetryTimestamp value="2026-10-22T00:10:00.000Z" />
      </AppIntlProvider>,
    );

    expect(formatOf("2026-10-22T00:10:00.000Z")).toBe("dateTime");

    act(() => {
      vi.setSystemTime(new Date("2026-10-22T00:00:20.000Z"));
      vi.advanceTimersByTime(30_000);
    });

    expect(formatOf("2026-10-22T00:10:00.000Z")).toBe("time");
  });
});

function renderTimestamp(value: string, options: { now: string; timeZone?: string }): void {
  render(
    <AppIntlProvider
      locale="en-US"
      now={new Date(options.now)}
      timeZone={options.timeZone ?? "UTC"}
    >
      <RetryTimestamp value={value} />
    </AppIntlProvider>,
  );
}

function formatOf(value: string): string | null | undefined {
  return screen.getByText(value).getAttribute("data-format");
}
