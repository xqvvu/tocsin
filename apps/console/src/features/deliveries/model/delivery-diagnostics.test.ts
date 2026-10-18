import { describe, expect, it } from "vite-plus/test";

import type { DeliveryAttempt } from "@tocsin/core";

import {
  attemptDuration,
  summarizeDeliveryTiming,
} from "#/features/deliveries/model/delivery-diagnostics";

describe("delivery timing summary", () => {
  it("leaves every duration empty until a worker picks the delivery up", () => {
    expect(
      summarizeDeliveryTiming({ createdAt: "2026-10-12T10:00:00.000Z", finishedAt: null }, []),
    ).toEqual({ queueLatency: null, sendDuration: null, endToEndDuration: null });
  });

  it("measures queue wait from creation to the earliest attempt", () => {
    const timing = summarizeDeliveryTiming(
      { createdAt: "2026-10-12T10:00:00.000Z", finishedAt: null },
      [
        attemptFixture({
          attemptNumber: 2,
          startedAt: "2026-10-12T10:00:12.000Z",
          finishedAt: "2026-10-12T10:00:14.000Z",
        }),
        attemptFixture({
          attemptNumber: 1,
          startedAt: "2026-10-12T10:00:05.000Z",
          finishedAt: "2026-10-12T10:00:08.000Z",
        }),
      ],
    );

    expect(timing.queueLatency).toBe("5.0s");
  });

  it("sums finished attempts but never counts an in-flight attempt", () => {
    const timing = summarizeDeliveryTiming(
      { createdAt: "2026-10-12T10:00:00.000Z", finishedAt: null },
      [
        attemptFixture({
          attemptNumber: 1,
          startedAt: "2026-10-12T10:00:05.000Z",
          finishedAt: "2026-10-12T10:00:08.000Z",
        }),
        attemptFixture({
          attemptNumber: 2,
          startedAt: "2026-10-12T10:00:30.000Z",
          finishedAt: "2026-10-12T10:00:33.000Z",
        }),
        attemptFixture({
          attemptNumber: 3,
          state: "running",
          startedAt: "2026-10-12T10:01:00.000Z",
          finishedAt: null,
        }),
      ],
    );

    expect(timing.sendDuration).toBe("6.0s");
  });

  it("reports end-to-end time only once the job is terminal", () => {
    const attempts = [
      attemptFixture({
        attemptNumber: 1,
        startedAt: "2026-10-12T10:00:05.000Z",
        finishedAt: "2026-10-12T10:00:08.000Z",
      }),
    ];

    expect(
      summarizeDeliveryTiming(
        { createdAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T10:00:20.000Z" },
        attempts,
      ).endToEndDuration,
    ).toBe("20.0s");
    expect(
      summarizeDeliveryTiming({ createdAt: "2026-10-12T10:00:00.000Z", finishedAt: null }, attempts)
        .endToEndDuration,
    ).toBeNull();
  });

  it("ignores attempts with unusable timestamps", () => {
    const timing = summarizeDeliveryTiming(
      { createdAt: "2026-10-12T10:00:00.000Z", finishedAt: null },
      [attemptFixture({ startedAt: "not-a-date", finishedAt: "also-not-a-date" })],
    );

    expect(timing.queueLatency).toBeNull();
    expect(timing.sendDuration).toBeNull();
  });
});

describe("attempt duration", () => {
  it("derives the send time of one attempt", () => {
    expect(
      attemptDuration({
        startedAt: "2026-10-12T10:00:05.000Z",
        finishedAt: "2026-10-12T10:00:06.250Z",
      }),
    ).toBe("1.3s");
  });

  it("shows no duration while the attempt is still running", () => {
    expect(attemptDuration({ startedAt: "2026-10-12T10:00:05.000Z", finishedAt: null })).toBeNull();
  });
});

function attemptFixture(overrides: Partial<DeliveryAttempt> = {}): DeliveryAttempt {
  return {
    id: "attempt-1",
    deliveryId: "delivery-1",
    attemptNumber: 1,
    state: "succeeded",
    responseStatus: 200,
    responseBody: null,
    error: null,
    startedAt: "2026-10-12T10:00:05.000Z",
    finishedAt: "2026-10-12T10:00:08.000Z",
    ...overrides,
  };
}
