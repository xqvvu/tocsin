import { describe, expect, it } from "vite-plus/test";

import type { NormalizedEvent } from "#core/event/normalized-event";
import type { RouteDefinitionInput } from "#core/route/route";
import {
  RouteDefinitionSchema,
  RouteMatchResultsSchema,
  evaluateRouteMatch,
  findMatchingRoutes,
  routeMatchesEvent,
} from "#core/route/route";

const event: NormalizedEvent = {
  title: "Checkout API latency high",
  message: "p95 latency exceeded for checkout in prod",
  severity: "critical",
  status: "firing",
  fingerprint: "checkout-api-latency",
  labels: {
    service: "checkout",
    environment: "prod",
  },
  occurredAt: "2026-06-07T08:00:00.000Z",
};

const route: RouteDefinitionInput = {
  id: "route-critical-checkout",
  name: "Critical checkout alerts",
  enabled: true,
  destinationIds: ["dest-sre"],
  rule: {
    sourceIds: ["source-grafana"],
    severities: ["critical"],
    statuses: ["firing"],
    labels: [{ key: "service", operator: "equals", value: "checkout" }],
    titleContains: ["latency"],
    messageContains: ["prod"],
  },
};

describe("route matching", () => {
  it("matches inspectable route conditions", () => {
    const result = evaluateRouteMatch(route, {
      sourceId: "source-grafana",
      event,
    });

    expect(result.matched).toBe(true);
    expect(result.destinationIds).toEqual(["dest-sre"]);
    expect(result.checks.every((check) => check.matched)).toBe(true);
  });

  it("does not match disabled routes", () => {
    expect(
      routeMatchesEvent(
        {
          ...route,
          enabled: false,
        },
        {
          sourceId: "source-grafana",
          event,
        },
      ),
    ).toBe(false);
  });

  it("does not use fingerprint as suppression", () => {
    const repeatEvent = {
      ...event,
      message: "another repeat firing notification for the same alert",
    };

    expect(
      routeMatchesEvent(
        {
          id: "route-critical",
          name: "Critical alerts",
          enabled: true,
          destinationIds: ["dest-sre"],
          rule: {
            severities: ["critical"],
          },
        },
        {
          sourceId: "source-grafana",
          event: repeatEvent,
        },
      ),
    ).toBe(true);
  });

  it("returns only matching routes", () => {
    const matches = findMatchingRoutes(
      [
        route,
        {
          ...route,
          id: "route-warning",
          name: "Warnings",
          rule: {
            severities: ["warning"],
          },
        },
      ],
      {
        sourceId: "source-grafana",
        event,
      },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.routeId).toBe("route-critical-checkout");
  });

  it("rejects routes with duplicate destinations", () => {
    expect(() =>
      RouteDefinitionSchema.parse({
        id: "route-duplicate-destinations",
        name: "Duplicate destinations",
        destinationIds: ["dest-sre", "dest-sre"],
      }),
    ).toThrow("Route destination IDs must be unique");
  });

  it("rejects empty label matcher values", () => {
    expect(() =>
      RouteDefinitionSchema.parse({
        id: "route-empty-label",
        name: "Empty label",
        destinationIds: ["dest-sre"],
        rule: {
          labels: [{ key: "service", operator: "contains", value: "" }],
        },
      }),
    ).toThrow("Too small");
  });

  it("trims route string conditions at schema boundaries", () => {
    expect(
      RouteDefinitionSchema.parse({
        id: " route-trimmed ",
        name: " Trimmed route ",
        destinationIds: [" dest-sre "],
        rule: {
          sourceIds: [" source-grafana "],
          labels: [{ key: " service ", operator: "equals", value: " checkout " }],
          titleContains: [" latency "],
          messageContains: [" prod "],
        },
      }),
    ).toMatchObject({
      id: "route-trimmed",
      name: "Trimmed route",
      destinationIds: ["dest-sre"],
      rule: {
        sourceIds: ["source-grafana"],
        labels: [{ key: "service", operator: "equals", value: "checkout" }],
        titleContains: ["latency"],
        messageContains: ["prod"],
      },
    });
  });

  it("rejects whitespace-only route string conditions", () => {
    expect(() =>
      RouteDefinitionSchema.parse({
        id: "route-whitespace-source",
        name: "Whitespace source",
        destinationIds: ["dest-sre"],
        rule: {
          sourceIds: ["   "],
        },
      }),
    ).toThrow("Too small");
    expect(() =>
      RouteDefinitionSchema.parse({
        id: "route-whitespace-title",
        name: "Whitespace title",
        destinationIds: ["dest-sre"],
        rule: {
          titleContains: ["   "],
        },
      }),
    ).toThrow("Too small");
    expect(() =>
      RouteDefinitionSchema.parse({
        id: "route-whitespace-label",
        name: "Whitespace label",
        destinationIds: ["dest-sre"],
        rule: {
          labels: [{ key: "service", operator: "contains", value: "   " }],
        },
      }),
    ).toThrow("Too small");
  });
});

describe("route match evidence", () => {
  it("records the event value each condition was applied to", () => {
    const result = evaluateRouteMatch(route, { sourceId: "source-grafana", event });

    const byField = (field: string) => result.checks.find((check) => check.field === field);

    // The console localizes these, so the raw expected/actual pair has to be
    // structured rather than only baked into the English `detail` string.
    expect(byField("severity")).toMatchObject({
      condition: "compare",
      expected: ["critical"],
      actual: "critical",
    });
    expect(byField("source")).toMatchObject({
      condition: "compare",
      expected: ["source-grafana"],
      actual: "source-grafana",
    });
    expect(byField("label")).toMatchObject({
      condition: "compare",
      expected: ["checkout"],
      actual: "checkout",
      labelKey: "service",
    });
    // title/message conditions carry the whole haystack, which is the value the
    // operator was previously forced to go find on the normalized tab.
    expect(byField("title")).toMatchObject({
      condition: "compare",
      expected: ["latency"],
      actual: event.title,
    });
    expect(byField("message")).toMatchObject({
      condition: "compare",
      expected: ["prod"],
      actual: event.message,
    });
  });

  it("omits the actual value when the event has no such label", () => {
    const result = evaluateRouteMatch(
      {
        ...route,
        rule: { ...route.rule, labels: [{ key: "absent", operator: "equals", value: "x" }] },
      },
      { sourceId: "source-grafana", event },
    );

    const labelCheck = result.checks.find((check) => check.field === "label");

    // An absent label must stay distinguishable from a label that is present
    // and different — that is the commonest reason a label condition misses.
    expect(labelCheck).toMatchObject({ matched: false, condition: "compare", expected: ["x"] });
    expect(labelCheck?.actual).toBeUndefined();
    expect(labelCheck?.labelKey).toBe("absent");
  });

  it("marks fields the rule does not constrain", () => {
    const result = evaluateRouteMatch(
      {
        id: "route-open",
        name: "Open route",
        enabled: true,
        destinationIds: ["dest-sre"],
        rule: {},
      },
      { sourceId: "source-grafana", event },
    );

    for (const check of result.checks) {
      expect(check.condition).toBe("none");
      expect(check.expected).toBeUndefined();
      expect(check.actual).toBeUndefined();
    }
  });

  it("keeps the structured fields out of the encoded snapshot schema", () => {
    // The snapshot is persisted, so the new fields are optional by construction:
    // checks written before them must still parse.
    const legacy = RouteMatchResultsSchema.parse([
      {
        routeId: "route-1",
        routeName: "Legacy",
        matched: true,
        destinationIds: ["dest-sre"],
        checks: [{ field: "enabled", matched: true, detail: "Route is enabled" }],
      },
    ]);

    expect(legacy[0]?.checks[0]?.condition).toBeUndefined();
  });
});
