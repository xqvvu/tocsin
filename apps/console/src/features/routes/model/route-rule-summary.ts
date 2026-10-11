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

export function buildRouteRuleChips(
  rule: RouteRule,
  sourceNameForId: (sourceId: string) => string,
  copy: RouteRuleSummaryCopy,
): string[] {
  return [
    ...rule.sourceIds.map((sourceId) => `${copy.source}: ${sourceNameForId(sourceId)}`),
    ...rule.severities.map((severity) => `${copy.severity}: ${copy.severityLabel(severity)}`),
    ...rule.statuses.map((status) => `${copy.status}: ${copy.statusLabel(status)}`),
    ...rule.labels.map((label) => formatLabelCondition(label)),
    ...rule.titleContains.map((value) => `${copy.title}: ${value}`),
    ...rule.messageContains.map((value) => `${copy.message}: ${value}`),
  ];
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
