import type { RouteDefinition } from "@tocsin/core";

export type RouteRule = RouteDefinition["rule"];

/**
 * Locale-agnostic copy + value formatters for route rule chips and tooltips.
 * Callers supply translated strings; this module never imports i18n runtime.
 */
export interface RouteRuleSummaryCopy {
  allEvents: string;
  source: string;
  severity: string;
  status: string;
  labels: string;
  title: string;
  message: string;
  /** Tooltip phrase for multi-source count, e.g. "Sources: 2" / "告警源 2 个" */
  sourcesCount: (count: number) => string;
  /** Tooltip phrases for contains-style conditions */
  titleContains: string;
  messageContains: string;
  partSeparator: string;
  listSeparator: string;
  severityLabel: (severity: RouteRule["severities"][number]) => string;
  statusLabel: (status: RouteRule["statuses"][number]) => string;
}

export type RouteRuleGroupKind = "source" | "severity" | "status" | "label" | "title" | "message";

/**
 * One chip per condition dimension, with that dimension's values joined.
 *
 * A rule holds at most six dimensions but any number of values in each. One
 * chip per value repeats the dimension label and multiplies the chips a narrow
 * table column has to fit, which is what squeezed the Routes rule cell. Grouping
 * bounds the cell at six chips and keeps each condition class readable as a
 * unit: `告警源 A、B`, `级别 严重、警告`, `标签 team=sre、service~api`.
 */
export interface RouteRuleGroup {
  kind: RouteRuleGroupKind;
  /** Localized dimension label, rendered muted inside the chip. */
  label: string;
  /** This dimension's values joined with the locale list separator. */
  value: string;
  /** Operator-authored matchers read better in mono; names and enums do not. */
  mono: boolean;
}

export function buildRouteRuleGroups(
  rule: RouteRule,
  sourceNameForId: (sourceId: string) => string,
  copy: RouteRuleSummaryCopy,
): RouteRuleGroup[] {
  const groups: RouteRuleGroup[] = [];

  if (rule.sourceIds.length > 0) {
    groups.push({
      kind: "source",
      label: copy.source,
      value: rule.sourceIds.map(sourceNameForId).join(copy.listSeparator),
      mono: false,
    });
  }

  if (rule.severities.length > 0) {
    groups.push({
      kind: "severity",
      label: copy.severity,
      value: rule.severities
        .map((severity) => copy.severityLabel(severity))
        .join(copy.listSeparator),
      mono: false,
    });
  }

  if (rule.statuses.length > 0) {
    groups.push({
      kind: "status",
      label: copy.status,
      value: rule.statuses.map((status) => copy.statusLabel(status)).join(copy.listSeparator),
      mono: false,
    });
  }

  if (rule.labels.length > 0) {
    groups.push({
      kind: "label",
      label: copy.labels,
      value: rule.labels.map((label) => formatLabelCondition(label)).join(copy.listSeparator),
      mono: true,
    });
  }

  if (rule.titleContains.length > 0) {
    groups.push({
      kind: "title",
      label: copy.title,
      value: rule.titleContains.join(copy.listSeparator),
      mono: true,
    });
  }

  if (rule.messageContains.length > 0) {
    groups.push({
      kind: "message",
      label: copy.message,
      value: rule.messageContains.join(copy.listSeparator),
      mono: true,
    });
  }

  return groups;
}

/** Compact operator-facing rule summary for tooltips and titles. */
export function describeRouteRule(rule: RouteRule, copy: RouteRuleSummaryCopy): string {
  const labelParts = rule.labels.map((label) => formatLabelCondition(label));
  const parts = [
    rule.sourceIds.length > 0 ? copy.sourcesCount(rule.sourceIds.length) : null,
    rule.severities.length > 0
      ? `${copy.severity}: ${rule.severities.map((severity) => copy.severityLabel(severity)).join(copy.listSeparator)}`
      : null,
    rule.statuses.length > 0
      ? `${copy.status}: ${rule.statuses.map((status) => copy.statusLabel(status)).join(copy.listSeparator)}`
      : null,
    labelParts.length > 0 ? `${copy.labels}: ${labelParts.join(copy.listSeparator)}` : null,
    rule.titleContains.length > 0
      ? `${copy.titleContains}: ${rule.titleContains.join(copy.listSeparator)}`
      : null,
    rule.messageContains.length > 0
      ? `${copy.messageContains}: ${rule.messageContains.join(copy.listSeparator)}`
      : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(copy.partSeparator) : copy.allEvents;
}

/** @deprecated Prefer describeRouteRule with localized copy. Kept for call sites needing English debug text. */
export function describeRule(rule: RouteRule): string {
  return describeRouteRule(rule, englishDebugRouteRuleSummaryCopy);
}

function formatLabelCondition(label: RouteRule["labels"][number]): string {
  return `${label.key}${label.operator === "equals" ? "=" : "~"}${label.value}`;
}

const englishDebugRouteRuleSummaryCopy: RouteRuleSummaryCopy = {
  allEvents: "All events",
  source: "source",
  severity: "severity",
  status: "status",
  labels: "labels",
  title: "title",
  message: "message",
  sourcesCount: (count) => `sources: ${count}`,
  titleContains: "title",
  messageContains: "message",
  partSeparator: " · ",
  listSeparator: ",",
  severityLabel: (severity) => severity,
  statusLabel: (status) => status,
};
