import { describe, expect, it } from "vite-plus/test";

import { rawPayloadRetentionWindow } from "#/lib/raw-payload-retention";

const RECEIVED_AT = "2026-10-01T00:00:00.000Z";

describe("raw payload retention window", () => {
  it("closes exactly retentionDays after the event was received", () => {
    expect(
      rawPayloadRetentionWindow({
        receivedAt: RECEIVED_AT,
        retentionDays: 30,
        now: new Date("2026-10-15T00:00:00.000Z"),
      }),
    ).toEqual({
      expiresAt: "2026-10-31T00:00:00.000Z",
      retentionDays: 30,
      expired: false,
    });
  });

  it("treats the closing instant itself as expired", () => {
    // Intake prunes `received_at < cutoff`, so at the cutoff the row is already
    // due: the hint must not promise a window that has just closed.
    expect(
      rawPayloadRetentionWindow({
        receivedAt: RECEIVED_AT,
        retentionDays: 30,
        now: new Date("2026-10-31T00:00:00.000Z"),
      }),
    ).toMatchObject({ expired: true });
  });

  it("reports an expired window that the lazy sweep has not cleared yet", () => {
    expect(
      rawPayloadRetentionWindow({
        receivedAt: RECEIVED_AT,
        retentionDays: 7,
        now: new Date("2026-10-28T00:00:00.000Z"),
      }),
    ).toMatchObject({ expiresAt: "2026-10-08T00:00:00.000Z", expired: true });
  });

  it("returns null when settings or the timestamp cannot describe a window", () => {
    const now = new Date("2026-10-15T00:00:00.000Z");

    expect(
      rawPayloadRetentionWindow({ receivedAt: RECEIVED_AT, retentionDays: undefined, now }),
    ).toBeNull();
    expect(
      rawPayloadRetentionWindow({ receivedAt: RECEIVED_AT, retentionDays: 0, now }),
    ).toBeNull();
    expect(
      rawPayloadRetentionWindow({ receivedAt: RECEIVED_AT, retentionDays: Number.NaN, now }),
    ).toBeNull();
    expect(
      rawPayloadRetentionWindow({ receivedAt: "not-a-date", retentionDays: 30, now }),
    ).toBeNull();
  });
});
