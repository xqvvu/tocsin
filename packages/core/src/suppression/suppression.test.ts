import { describe, expect, it } from "vite-plus/test";

import {
  SuppressionMatcherSchema,
  SuppressionMatchResultSchema,
  SuppressionSchema,
  evaluateSuppressionMatch,
  selectSuppressionForDelivery,
  suppressionIsActive,
  suppressionStateAt,
} from "#core/suppression/suppression";
import type { Suppression } from "#core/suppression/suppression";

const now = "2026-10-12T12:00:00.000Z";

function suppression(overrides: Partial<Suppression> = {}): Suppression {
  return SuppressionSchema.parse({
    id: "suppression-1",
    name: "Checkout maintenance",
    kind: "maintenance_window",
    enabled: true,
    reason: "CHG-1234",
    matcher: {},
    startsAt: "2026-10-12T11:00:00.000Z",
    endsAt: "2026-10-12T13:00:00.000Z",
    createdBy: "owner",
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
    ...overrides,
  });
}

const event = {
  severity: "critical" as const,
  status: "firing" as const,
  fingerprint: "checkout:unavailable",
  title: "Checkout latency",
  message: "prod checkout returned 503",
  labels: { service: "checkout", environment: "prod" },
};

describe("suppression lifecycle", () => {
  it("projects the state from the window, not from a stored column", () => {
    expect(suppressionStateAt(suppression(), "2026-10-12T10:30:00.000Z")).toBe("scheduled");
    expect(suppressionStateAt(suppression(), now)).toBe("active");
    // The window is half-open: at `endsAt` exactly, it has already lapsed.
    expect(suppressionStateAt(suppression(), "2026-10-12T13:00:00.000Z")).toBe("expired");
    expect(suppressionStateAt(suppression(), "2026-10-12T14:00:00.000Z")).toBe("expired");
  });

  it("treats the start instant as inside the window", () => {
    expect(suppressionIsActive(suppression(), "2026-10-12T11:00:00.000Z")).toBe(true);
  });

  it("reports disabled ahead of expired", () => {
    // An operator who switched a rule off wants to see that, not that its window
    // also happened to lapse — the two need different next actions.
    expect(suppressionStateAt(suppression({ enabled: false }), "2026-10-12T14:00:00.000Z")).toBe(
      "disabled",
    );
  });

  it("never silences anything once the window has ended", () => {
    expect(suppressionIsActive(suppression(), "2026-10-12T13:00:01.000Z")).toBe(false);
    expect(
      selectSuppressionForDelivery([suppression()], matchInput(), "2026-10-12T13:00:01.000Z"),
    ).toBe(null);
  });
});

describe("suppression matching", () => {
  it("uses the same vocabulary as route rules", () => {
    // An empty matcher restricts nothing, exactly like an empty RouteRule.
    const result = evaluateSuppressionMatch(
      { id: "s", name: "S", matcher: SuppressionMatcherSchema.parse({}) },
      matchInput(),
    );

    expect(result.matched).toBe(true);
    for (const check of result.checks) {
      expect(check.condition).toBe("none");
    }
  });

  it("matches labels with the route engine's operators", () => {
    const equals = evaluateSuppressionMatch(
      {
        id: "s",
        name: "S",
        matcher: { labels: [{ key: "service", operator: "equals", value: "checkout" }] },
      },
      matchInput(),
    );
    const contains = evaluateSuppressionMatch(
      {
        id: "s",
        name: "S",
        matcher: { labels: [{ key: "service", operator: "contains", value: "check" }] },
      },
      matchInput(),
    );
    const misses = evaluateSuppressionMatch(
      {
        id: "s",
        name: "S",
        matcher: { labels: [{ key: "service", operator: "equals", value: "billing" }] },
      },
      matchInput(),
    );

    expect(equals.matched).toBe(true);
    expect(contains.matched).toBe(true);
    expect(misses.matched).toBe(false);
  });

  it("narrows by destination, which a route rule cannot express", () => {
    const matcher = { destinationIds: ["destination-1"] };

    expect(evaluateSuppressionMatch({ id: "s", name: "S", matcher }, matchInput()).matched).toBe(
      true,
    );
    expect(
      evaluateSuppressionMatch(
        { id: "s", name: "S", matcher },
        matchInput({ destinationId: "destination-2" }),
      ).matched,
    ).toBe(false);
  });

  it("narrows by fingerprint by exact identity", () => {
    const matcher = { fingerprints: ["checkout:unavailable"] };

    expect(evaluateSuppressionMatch({ id: "s", name: "S", matcher }, matchInput()).matched).toBe(
      true,
    );
    expect(
      evaluateSuppressionMatch(
        { id: "s", name: "S", matcher },
        matchInput({ event: { ...event, fingerprint: "checkout:other" } }),
      ).matched,
    ).toBe(false);
  });

  it("carries the evidence needed to explain a match", () => {
    const result = evaluateSuppressionMatch(
      {
        id: "s",
        name: "S",
        matcher: {
          severities: ["critical"],
          messageContains: ["503"],
          destinationIds: ["destination-1"],
        },
      },
      matchInput(),
    );

    expect(result.matched).toBe(true);
    // The console renders these with the route-match component, so the actual
    // values have to be present, not just a boolean.
    expect(result.checks.find((check) => check.field === "severity")).toMatchObject({
      expected: ["critical"],
      actual: "critical",
    });
    expect(result.checks.find((check) => check.field === "message")).toMatchObject({
      expected: ["503"],
      actual: event.message,
    });
    expect(result.checks.find((check) => check.field === "destination")).toMatchObject({
      expected: ["destination-1"],
      actual: "destination-1",
    });
  });

  it("accepts a suppression-only check field through the shared schema", () => {
    const result = evaluateSuppressionMatch(
      { id: "s", name: "S", matcher: { fingerprints: ["checkout:unavailable"] } },
      matchInput(),
    );

    // `fingerprint` and `destination` are not route-check fields; they were added
    // to the shared enum so this evidence round-trips through RouteMatchCheckSchema
    // and the console can render it with the route-match component.
    const fields = result.checks.map((check) => check.field);

    expect(fields).toContain("fingerprint");
    expect(fields).toContain("destination");

    // Round-trips through the schema that the API and UI actually validate with.
    expect(() => SuppressionMatchResultSchema.parse(result)).not.toThrow();
  });
});

describe("picking the one suppression that silences a delivery", () => {
  it("returns null when nothing matches", () => {
    expect(selectSuppressionForDelivery([], matchInput(), now)).toBeNull();
  });

  it("ignores rules that are not in force", () => {
    const scheduled = suppression({
      startsAt: "2026-10-12T15:00:00.000Z",
      endsAt: "2026-10-12T16:00:00.000Z",
    });
    const disabled = suppression({ id: "s-2", enabled: false });

    expect(selectSuppressionForDelivery([scheduled, disabled], matchInput(), now)).toBeNull();
  });

  it("breaks ties deterministically by startsAt then id", () => {
    // At most one rule may claim a delivery, so "which rule silenced this" must
    // not depend on the order rows were loaded in.
    const later = suppression({
      id: "s-later",
      startsAt: "2026-10-12T11:30:00.000Z",
      endsAt: "2026-10-12T13:30:00.000Z",
    });
    const earlier = suppression({ id: "s-earlier", startsAt: "2026-10-12T11:00:00.000Z" });

    const forward = selectSuppressionForDelivery([later, earlier], matchInput(), now);
    const backward = selectSuppressionForDelivery([earlier, later], matchInput(), now);

    expect(forward?.suppressionId).toBe("s-earlier");
    expect(backward?.suppressionId).toBe("s-earlier");
  });

  it("prefers the lower id when the windows start together", () => {
    const alpha = suppression({ id: "s-alpha" });
    const beta = suppression({ id: "s-beta" });

    expect(selectSuppressionForDelivery([beta, alpha], matchInput(), now)?.suppressionId).toBe(
      "s-alpha",
    );
  });
});

function matchInput(overrides: Partial<Parameters<typeof evaluateSuppressionMatch>[1]> = {}) {
  return {
    sourceId: "source-grafana",
    destinationId: "destination-1",
    event,
    ...overrides,
  };
}
