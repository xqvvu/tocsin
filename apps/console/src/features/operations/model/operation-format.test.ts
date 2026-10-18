import { describe, expect, it } from "vite-plus/test";

import {
  formatDurationBetween,
  formatDurationMs,
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
