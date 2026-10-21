import { describe, expect, it } from "vite-plus/test";

import {
  datetimeLocalFromIso,
  defaultSuppressionWindow,
  emptySuppressionMatcher,
  isoFromDatetimeLocal,
  suppressionDefaultsFromDestination,
  suppressionDefaultsFromEvent,
  suppressionDefaultsFromLabel,
  suppressionDefaultsFromText,
  suppressionFormDefaultsFromRule,
  suppressionMatcherFromValues,
  suppressionMatcherIsEmpty,
} from "#/features/suppressions/model/suppression-form";

describe("suppression form model", () => {
  it("treats an all-empty matcher as silence-everything", () => {
    expect(suppressionMatcherIsEmpty(emptySuppressionMatcher())).toBe(true);
    expect(
      suppressionMatcherIsEmpty({
        ...emptySuppressionMatcher(),
        destinationIds: ["destination-1"],
      }),
    ).toBe(false);
  });

  it("counts an incomplete label row as empty after normalisation", () => {
    const matcher = {
      ...emptySuppressionMatcher(),
      labels: [{ key: "env", operator: "equals" as const, value: "   " }],
    };

    expect(suppressionMatcherFromValues(matcher).labels).toEqual([]);
    expect(suppressionMatcherIsEmpty(matcher)).toBe(true);
  });

  it("round-trips a stored window into datetime-local and back", () => {
    const iso = "2026-10-12T09:30:00.000Z";
    const local = datetimeLocalFromIso(iso, "UTC");

    expect(local).toBe("2026-10-12T09:30");
    expect(isoFromDatetimeLocal(local, "UTC")).toBe(iso);
    expect(isoFromDatetimeLocal("not a date", "UTC")).toBeNull();
  });

  it("reads and writes the window in the console time zone, not the browser zone", () => {
    expect(datetimeLocalFromIso("2026-10-12T02:00:00.000Z", "Asia/Shanghai")).toBe(
      "2026-10-12T10:00",
    );
    expect(isoFromDatetimeLocal("2026-10-12T10:00", "Asia/Shanghai")).toBe(
      "2026-10-12T02:00:00.000Z",
    );
  });

  it("applies the zone's daylight-saving offset for each side of the window", () => {
    expect(isoFromDatetimeLocal("2026-01-15T09:00", "America/New_York")).toBe(
      "2026-01-15T14:00:00.000Z",
    );
    expect(isoFromDatetimeLocal("2026-07-15T09:00", "America/New_York")).toBe(
      "2026-07-15T13:00:00.000Z",
    );
  });

  it("rejects impossible and malformed window values", () => {
    expect(isoFromDatetimeLocal("2026-02-31T10:00", "UTC")).toBeNull();
    expect(isoFromDatetimeLocal("2026-10-12T24:00", "UTC")).toBeNull();
    expect(isoFromDatetimeLocal("2026-10-12", "UTC")).toBeNull();
  });

  it("rejects a wall clock skipped by the spring-forward transition", () => {
    // 02:30 never happens in New York on 2026-03-08; saving 01:30 or 03:30
    // silently would show the operator a window they did not type.
    expect(isoFromDatetimeLocal("2026-03-08T02:30", "America/New_York")).toBeNull();
  });

  it("keeps the default two-hour window readable in the console time zone", () => {
    const window = defaultSuppressionWindow("Asia/Shanghai", new Date("2026-10-18T09:00:00.000Z"));

    expect(window).toEqual({ startsAt: "2026-10-18T17:00", endsAt: "2026-10-18T19:00" });
  });

  it("prefills only the destination when silencing one notification target", () => {
    const defaults = suppressionDefaultsFromDestination({
      name: "Silence: Ops group",
      destinationId: "destination-ops",
      timeZone: "UTC",
      now: new Date("2026-10-18T09:00:00.000Z"),
    });

    expect(defaults.name).toBe("Silence: Ops group");
    expect(defaults.kind).toBe("silence");
    expect(defaults.enabled).toBe(true);
    expect(defaults.matcher.destinationIds).toEqual(["destination-ops"]);
    // Every other dimension stays open: the row action mutes this target for
    // all of its alerts, not one source or fingerprint.
    expect(defaults.matcher.sourceIds).toEqual([]);
    expect(defaults.matcher.fingerprints).toEqual([]);
    expect(defaults.matcher.labels).toEqual([]);
    expect(suppressionMatcherIsEmpty(defaults.matcher)).toBe(false);
    expect(defaults.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(Date.parse(defaults.endsAt)).toBeGreaterThan(Date.parse(defaults.startsAt));
  });

  it("prefills the event's source and fingerprint when silencing one alert", () => {
    const defaults = suppressionDefaultsFromEvent({
      name: "Silence: Disk full",
      sourceId: "source-1",
      fingerprint: "disk:full",
      timeZone: "UTC",
      now: new Date("2026-10-18T09:00:00.000Z"),
    });

    expect(defaults.name).toBe("Silence: Disk full");
    expect(defaults.kind).toBe("silence");
    expect(defaults.enabled).toBe(true);
    expect(defaults.matcher.sourceIds).toEqual(["source-1"]);
    expect(defaults.matcher.fingerprints).toEqual(["disk:full"]);
    expect(defaults.matcher.destinationIds).toEqual([]);
    expect(defaults.matcher.titleContains).toEqual([]);
    expect(suppressionMatcherIsEmpty(defaults.matcher)).toBe(false);
    expect(defaults.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(Date.parse(defaults.endsAt)).toBeGreaterThan(Date.parse(defaults.startsAt));
  });

  it("prefills the event's source and label when silencing one label value", () => {
    const defaults = suppressionDefaultsFromLabel({
      name: "Silence: Disk full",
      sourceId: "source-1",
      label: { key: "env", value: "prod" },
      timeZone: "UTC",
      now: new Date("2026-10-18T09:00:00.000Z"),
    });

    expect(defaults.kind).toBe("silence");
    expect(defaults.matcher.sourceIds).toEqual(["source-1"]);
    expect(defaults.matcher.labels).toEqual([{ key: "env", operator: "equals", value: "prod" }]);
    // Clicking one label must not silently widen the rule to the whole alert.
    expect(defaults.matcher.fingerprints).toEqual([]);
  });

  it("prefills the event's source and title fragment when silencing similar alerts", () => {
    const defaults = suppressionDefaultsFromText({
      name: "Silence: Disk full",
      sourceId: "source-1",
      field: "title",
      value: "  DiskFull  ",
      timeZone: "UTC",
      now: new Date("2026-10-18T09:00:00.000Z"),
    });

    expect(defaults.kind).toBe("silence");
    expect(defaults.matcher.sourceIds).toEqual(["source-1"]);
    expect(defaults.matcher.titleContains).toEqual(["DiskFull"]);
    expect(defaults.matcher.messageContains).toEqual([]);
    // A text match must not quietly become a fingerprint or whole-alert rule.
    expect(defaults.matcher.fingerprints).toEqual([]);
    expect(suppressionMatcherIsEmpty(defaults.matcher)).toBe(false);
  });

  it("prefills a message fragment without touching the title matcher", () => {
    const defaults = suppressionDefaultsFromText({
      name: "Silence: Disk full",
      sourceId: "source-1",
      field: "message",
      value: "connection timeout",
      timeZone: "UTC",
      now: new Date("2026-10-18T09:00:00.000Z"),
    });

    expect(defaults.matcher.messageContains).toEqual(["connection timeout"]);
    expect(defaults.matcher.titleContains).toEqual([]);
    expect(defaults.matcher.fingerprints).toEqual([]);
  });

  it("keeps every matcher dimension when editing an existing rule", () => {
    const defaults = suppressionFormDefaultsFromRule(
      {
        id: "suppression-1",
        name: "October database migration",
        kind: "maintenance_window",
        enabled: false,
        reason: "CHG-1234",
        matcher: {
          sourceIds: ["source-1"],
          destinationIds: ["destination-1"],
          severities: ["critical"],
          statuses: ["firing", "resolved"],
          fingerprints: ["disk:full"],
          labels: [{ key: "env", operator: "contains", value: "prod" }],
          titleContains: ["DiskFull"],
          messageContains: ["volume"],
        },
        startsAt: "2026-10-12T09:00:00.000Z",
        endsAt: "2026-10-12T11:00:00.000Z",
        createdBy: "user-1",
        createdAt: "2026-10-12T08:00:00.000Z",
        updatedAt: "2026-10-12T08:00:00.000Z",
      },
      "UTC",
    );

    expect(defaults.name).toBe("October database migration");
    expect(defaults.enabled).toBe(false);
    expect(defaults.reason).toBe("CHG-1234");
    expect(defaults.startsAt).toBe("2026-10-12T09:00");
    expect(defaults.endsAt).toBe("2026-10-12T11:00");
    expect(defaults.matcher.fingerprints).toEqual(["disk:full"]);
    expect(defaults.matcher.labels).toHaveLength(1);
    expect(defaults.matcher.statuses).toEqual(["firing", "resolved"]);
  });
});
