import { describe, expect, it } from "vite-plus/test";

import {
  formatDateTimeCompact,
  formatDurationBetween,
  formatDurationMs,
  retryTimestampFormat,
} from "#/features/operations/model/operation-format";

describe("duration formatting", () => {
  it("keeps sub-second durations in milliseconds", () => {
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(850)).toBe("850ms");
  });

  it("uses one decimal for durations under a minute", () => {
    expect(formatDurationMs(1200)).toBe("1.2s");
    expect(formatDurationMs(59_900)).toBe("59.9s");
  });

  it("rounds a near-minute duration into minutes instead of showing 60s", () => {
    expect(formatDurationMs(59_950)).toBe("1m 00s");
  });

  it("keeps minutes, hours, and days compact", () => {
    expect(formatDurationMs(192_000)).toBe("3m 12s");
    expect(formatDurationMs(3_900_000)).toBe("1h 05m");
    expect(formatDurationMs(90_000_000)).toBe("1d 01h");
  });

  it("rejects unusable inputs instead of rendering NaN or a negative duration", () => {
    expect(formatDurationMs(-1)).toBeNull();
    expect(formatDurationMs(Number.NaN)).toBeNull();
    expect(formatDurationMs(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns null when the end timestamp is missing or precedes the start", () => {
    expect(formatDurationBetween("2026-10-12T10:00:00.000Z", null)).toBeNull();
    expect(
      formatDurationBetween("2026-10-12T10:00:05.000Z", "2026-10-12T10:00:00.000Z"),
    ).toBeNull();
    expect(formatDurationBetween("not-a-date", "2026-10-12T10:00:00.000Z")).toBeNull();
  });

  it("derives a duration from two ISO timestamps", () => {
    expect(formatDurationBetween("2026-10-12T10:00:00.000Z", "2026-10-12T10:00:07.500Z")).toBe(
      "7.5s",
    );
  });
});

describe("retry timestamp formatting", () => {
  const now = new Date("2026-10-21T10:00:00.000Z");

  it("keeps time-only for a retry later the same day", () => {
    expect(retryTimestampFormat("2026-10-21T10:15:00.000Z", now, "UTC")).toBe("time");
  });

  it("shows the date once the retry falls on another calendar day", () => {
    expect(retryTimestampFormat("2026-10-22T00:05:00.000Z", now, "UTC")).toBe("dateTime");
    expect(retryTimestampFormat("2030-01-01T00:00:00.000Z", now, "UTC")).toBe("dateTime");
  });

  it("compares calendar days in the configured time zone, not UTC", () => {
    // 2026-10-21T23:30Z is already 2026-10-22 in Shanghai.
    expect(retryTimestampFormat("2026-10-21T23:30:00.000Z", now, "Asia/Shanghai")).toBe("dateTime");
    // 2026-10-20T17:00Z is already 2026-10-21 in Shanghai.
    expect(retryTimestampFormat("2026-10-20T17:00:00.000Z", now, "Asia/Shanghai")).toBe("time");
  });

  it("falls back to the dated format for an unusable timestamp", () => {
    expect(retryTimestampFormat("not-a-date", now, "UTC")).toBe("dateTime");
  });
});

describe("compact timestamp formatting", () => {
  it("drops the year and seconds so the value fits a chip", () => {
    expect(
      formatDateTimeCompact("2026-10-23T04:05:06.000Z", { locale: "en-US", timeZone: "UTC" }),
    ).toBe("10/23, 04:05");
  });

  it("formats in the configured time zone", () => {
    // 2026-10-22T20:05Z is 2026-10-23 04:05 in Shanghai.
    expect(
      formatDateTimeCompact("2026-10-22T20:05:00.000Z", {
        locale: "zh-Hans",
        timeZone: "Asia/Shanghai",
      }),
    ).toBe("10/23 04:05");
  });
});
