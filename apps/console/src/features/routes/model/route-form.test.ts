import { describe, expect, it } from "vite-plus/test";

import {
  createEmptyLabelCondition,
  getRouteRuleFormRestrictions,
  isIncompleteLabelCondition,
  routeFormDefaultsFromRule,
  routeRuleFromValues,
  type RouteRuleFormValues,
} from "#/features/routes/model/route-form";

/** Two entries in every condition class: the shape only import/TOML/API can produce. */
function multiConditionRule(): RouteRuleFormValues {
  return {
    sourceIds: ["source-grafana", "source-alertmanager"],
    severities: ["critical", "warning"],
    statuses: ["firing", "unknown"],
    labels: [
      { key: "team", operator: "equals", value: "sre" },
      { key: "cluster", operator: "contains", value: "prod" },
    ],
    titleContains: ["DiskFull", "VolumeFull"],
    messageContains: ["volume", "filesystem"],
  };
}

function formValues(overrides: Partial<RouteRuleFormValues> = {}): RouteRuleFormValues {
  return {
    sourceIds: [],
    severities: [],
    statuses: [],
    labels: [],
    titleContains: [],
    messageContains: [],
    ...overrides,
  };
}

describe("route form helpers", () => {
  it("maps every condition row into an inspectable route rule", () => {
    expect(
      routeRuleFromValues(
        formValues({
          sourceIds: ["source-grafana", "source-alertmanager"],
          severities: ["critical", "warning"],
          statuses: ["firing"],
          labels: [
            { key: "service", operator: "contains", value: "checkout" },
            { key: "team", operator: "equals", value: "sre" },
          ],
          titleContains: ["LatencyHigh", "DiskFull"],
          messageContains: ["timeout"],
        }),
      ),
    ).toEqual({
      sourceIds: ["source-grafana", "source-alertmanager"],
      severities: ["critical", "warning"],
      statuses: ["firing"],
      labels: [
        { key: "service", operator: "contains", value: "checkout" },
        { key: "team", operator: "equals", value: "sre" },
      ],
      titleContains: ["LatencyHigh", "DiskFull"],
      messageContains: ["timeout"],
    });
  });

  it("treats empty condition rows as absent conditions", () => {
    expect(
      routeRuleFromValues(
        formValues({
          sourceIds: ["", "  "],
          titleContains: ["   "],
          labels: [
            createEmptyLabelCondition(),
            { key: "team", operator: "equals", value: "   " },
            { key: "  ", operator: "equals", value: "sre" },
          ],
        }),
      ),
    ).toEqual({
      sourceIds: [],
      severities: [],
      statuses: [],
      labels: [],
      titleContains: [],
      messageContains: [],
    });
  });

  it("trims condition rows before storing them", () => {
    expect(
      routeRuleFromValues(
        formValues({
          sourceIds: ["  source-grafana  "],
          labels: [{ key: " team ", operator: "equals", value: " sre " }],
          titleContains: [" DiskFull "],
          messageContains: [" volume "],
        }),
      ),
    ).toEqual({
      sourceIds: ["source-grafana"],
      severities: [],
      statuses: [],
      labels: [{ key: "team", operator: "equals", value: "sre" }],
      titleContains: ["DiskFull"],
      messageContains: ["volume"],
    });
  });

  it("derives one editable row for every stored condition", () => {
    const rule = multiConditionRule();
    const values = routeFormDefaultsFromRule(rule);

    expect(values).toEqual(rule);
    // The defaults are editable copies, not aliases of the stored arrays.
    expect(values.sourceIds).not.toBe(rule.sourceIds);
    expect(values.labels).not.toBe(rule.labels);
    expect(values.labels[0]).not.toBe(rule.labels[0]);
  });

  it("round-trips a multi-condition rule the operator did not change", () => {
    const rule = multiConditionRule();

    expect(routeRuleFromValues(routeFormDefaultsFromRule(rule))).toEqual(rule);
  });

  it("flags label rows that carry only half of the condition", () => {
    expect(isIncompleteLabelCondition({ key: "team", operator: "equals", value: "" })).toBe(true);
    expect(isIncompleteLabelCondition({ key: "", operator: "equals", value: "sre" })).toBe(true);
    expect(isIncompleteLabelCondition({ key: "team", operator: "equals", value: "sre" })).toBe(
      false,
    );
    expect(isIncompleteLabelCondition(createEmptyLabelCondition())).toBe(false);
  });

  it("reports stored source conditions the source picker cannot offer", () => {
    expect(
      getRouteRuleFormRestrictions(multiConditionRule(), {
        knownSourceIds: ["source-grafana", "source-alertmanager"],
      }),
    ).toEqual({ restricted: false, fields: [] });

    expect(
      getRouteRuleFormRestrictions(
        { ...multiConditionRule(), sourceIds: ["source-grafana", "source-retired"] },
        { knownSourceIds: ["source-grafana"] },
      ),
    ).toEqual({
      restricted: true,
      fields: [{ field: "sourceIds", values: ["source-retired"] }],
    });
  });
});
