import { describe, expect, it } from "vite-plus/test";

import {
  datetimeLocalFromIso,
  emptySuppressionMatcher,
  isoFromDatetimeLocal,
  suppressionDefaultsFromEvent,
  suppressionDefaultsFromLabel,
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
    const local = datetimeLocalFromIso(iso);

    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(isoFromDatetimeLocal(local)).toBe(iso);
    expect(isoFromDatetimeLocal("not a date")).toBeNull();
  });

  it("prefills the event's source and fingerprint when silencing one alert", () => {
    const defaults = suppressionDefaultsFromEvent({
      name: "Silence: Disk full",
      sourceId: "source-1",
      fingerprint: "disk:full",
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
      now: new Date("2026-10-18T09:00:00.000Z"),
    });

    expect(defaults.kind).toBe("silence");
    expect(defaults.matcher.sourceIds).toEqual(["source-1"]);
    expect(defaults.matcher.labels).toEqual([{ key: "env", operator: "equals", value: "prod" }]);
    // Clicking one label must not silently widen the rule to the whole alert.
    expect(defaults.matcher.fingerprints).toEqual([]);
  });

  it("keeps every matcher dimension when editing an existing rule", () => {
    const defaults = suppressionFormDefaultsFromRule({
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
    });

    expect(defaults.name).toBe("October database migration");
    expect(defaults.enabled).toBe(false);
    expect(defaults.reason).toBe("CHG-1234");
    expect(defaults.matcher.fingerprints).toEqual(["disk:full"]);
    expect(defaults.matcher.labels).toHaveLength(1);
    expect(defaults.matcher.statuses).toEqual(["firing", "resolved"]);
  });
});
