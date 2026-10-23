import type { RouteRule } from "@tocsin/core";

export type RouteSeverityCondition = RouteRule["severities"][number];
export type RouteStatusCondition = RouteRule["statuses"][number];
export type RouteLabelCondition = RouteRule["labels"][number];

/**
 * Editable mirror of a route rule. Every stored entry of every condition class
 * gets exactly one row here, so the form shows all of them and the saved rule is
 * built from the rows the operator actually saw.
 *
 * An empty class means "no condition of that kind" (matching treats it as
 * unconditional), which is what removing every row expresses.
 */
export interface RouteRuleFormValues {
  sourceIds: string[];
  severities: RouteSeverityCondition[];
  statuses: RouteStatusCondition[];
  labels: RouteLabelCondition[];
  titleContains: string[];
  messageContains: string[];
}

/** Builds the stored rule from the form rows, dropping rows the operator left empty. */
export function routeRuleFromValues(values: RouteRuleFormValues): RouteRule {
  return {
    sourceIds: normalizeConditionValues(values.sourceIds),
    severities: [...values.severities],
    statuses: [...values.statuses],
    labels: values.labels
      .map((label) => ({
        key: label.key.trim(),
        operator: label.operator,
        value: label.value.trim(),
      }))
      .filter((label) => label.key.length > 0 && label.value.length > 0),
    titleContains: normalizeConditionValues(values.titleContains),
    messageContains: normalizeConditionValues(values.messageContains),
  };
}

/** Turns a stored rule into one editable row per stored entry. */
export function routeFormDefaultsFromRule(rule: RouteRule): RouteRuleFormValues {
  return {
    sourceIds: [...rule.sourceIds],
    severities: [...rule.severities],
    statuses: [...rule.statuses],
    labels: rule.labels.map((label) => ({ ...label })),
    titleContains: [...rule.titleContains],
    messageContains: [...rule.messageContains],
  };
}

/** A label row only applies when both the key and the value are filled. */
export function isIncompleteLabelCondition(condition: RouteLabelCondition): boolean {
  return (condition.key.trim().length === 0) !== (condition.value.trim().length === 0);
}

/**
 * Which alert states a route's status condition admits.
 *
 * An empty condition is unconditional: both firing and resolved events match,
 * which is also why the form treats it as "every state". Once the operator
 * picks states, anything unpicked is dropped for good — the consequential case
 * being a route that pages on trigger but silently never delivers recovery.
 */
export interface RouteStatusScope {
  deliversFiring: boolean;
  deliversResolved: boolean;
}

export function routeStatusScope(statuses: readonly RouteStatusCondition[]): RouteStatusScope {
  if (statuses.length === 0) {
    return { deliversFiring: true, deliversResolved: true };
  }

  return {
    deliversFiring: statuses.includes("firing"),
    deliversResolved: statuses.includes("resolved"),
  };
}

/**
 * A rule with no condition matches every alert. That is legal (it is how an
 * operator routes everything to one destination), but it must never happen by
 * accident: the form asks for confirmation before saving this shape.
 */
export function routeRuleIsEmpty(rule: RouteRule): boolean {
  return (
    rule.sourceIds.length === 0 &&
    rule.severities.length === 0 &&
    rule.statuses.length === 0 &&
    rule.labels.length === 0 &&
    rule.titleContains.length === 0 &&
    rule.messageContains.length === 0
  );
}

export function createEmptyLabelCondition(): RouteLabelCondition {
  return { key: "", operator: "equals", value: "" };
}

function normalizeConditionValues(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

export type RouteRuleFormRestrictionField =
  | "sourceIds"
  | "severities"
  | "statuses"
  | "labels"
  | "titleContains"
  | "messageContains";

export interface RouteRuleFormRestriction {
  field: RouteRuleFormRestrictionField;
  /** The exact stored entries the editable form cannot offer as choices. */
  values: string[];
}

export interface RouteRuleFormRestrictions {
  restricted: boolean;
  fields: RouteRuleFormRestriction[];
}

/**
 * Conditions whose stored entries exist but cannot be picked in the form:
 * today only source ids that are not part of the configured sources.
 *
 * The form still renders those entries so they round-trip untouched, and this
 * report makes sure the operator is told which values they are.
 */
export function getRouteRuleFormRestrictions(
  rule: RouteRule,
  options: { knownSourceIds: readonly string[] },
): RouteRuleFormRestrictions {
  const knownSourceIds = new Set(options.knownSourceIds);
  const unknownSourceIds = rule.sourceIds.filter((sourceId) => !knownSourceIds.has(sourceId));
  const fields: RouteRuleFormRestriction[] =
    unknownSourceIds.length > 0 ? [{ field: "sourceIds", values: unknownSourceIds }] : [];

  return {
    restricted: fields.length > 0,
    fields,
  };
}
