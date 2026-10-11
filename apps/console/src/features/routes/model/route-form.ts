import { formString, formTrimmedString, type RouteRule } from "@tocsin/core";

export function routeRuleFromForm(data: FormData): RouteRule {
  return routeRuleFromValues(routeFormValuesFromForm(data));
}

export function routeRuleFromValues(values: RouteRuleFormValues): RouteRule {
  const sourceId = values.sourceId.trim();
  const severity = values.severity;
  const status = values.status;
  const labelKey = values.labelKey.trim();
  const labelValue = values.labelValue.trim();
  const labelOperator = values.labelOperator === "contains" ? "contains" : "equals";
  const titleContains = values.titleContains.trim();
  const messageContains = values.messageContains.trim();

  return {
    sourceIds: sourceId ? [sourceId] : [],
    severities: severity === "any" ? [] : [severity],
    statuses: status === "any" ? [] : [status],
    labels:
      labelKey && labelValue
        ? [
            {
              key: labelKey,
              operator: labelOperator,
              value: labelValue,
            },
          ]
        : [],
    titleContains: titleContains ? [titleContains] : [],
    messageContains: messageContains ? [messageContains] : [],
  };
}

function routeFormValuesFromForm(data: FormData): RouteRuleFormValues {
  const sourceId = formTrimmedString(data, "sourceId");
  const severity = formString(data, "severity");
  const status = formString(data, "status");
  const labelKey = formTrimmedString(data, "labelKey");
  const labelValue = formTrimmedString(data, "labelValue");
  const labelOperator = formString(data, "labelOperator") === "contains" ? "contains" : "equals";
  const titleContains = formTrimmedString(data, "titleContains");
  const messageContains = formTrimmedString(data, "messageContains");

  return {
    sourceId,
    severity: severity === "any" ? "any" : (severity as RouteRuleFormValues["severity"]),
    status: status === "any" ? "any" : (status as RouteRuleFormValues["status"]),
    labelKey,
    labelOperator,
    labelValue,
    titleContains,
    messageContains,
  };
}

export function routeFormDefaultsFromRule(rule: RouteRule): RouteFormDefaults {
  const firstLabel = rule.labels[0];

  return {
    sourceId: rule.sourceIds[0] ?? "",
    severity: rule.severities[0] ?? "any",
    status: rule.statuses[0] ?? "any",
    labelKey: firstLabel?.key ?? "",
    labelOperator: firstLabel?.operator ?? "equals",
    labelValue: firstLabel?.value ?? "",
    titleContains: rule.titleContains[0] ?? "",
    messageContains: rule.messageContains[0] ?? "",
  };
}

/**
 * The visual route editor only exposes the first condition of each kind.
 * Matching still honors full multi-value RouteRule arrays (import/TOML/API).
 * Callers should surface a restricted-edit notice when `restricted` is true.
 */
export type RouteRuleFormRestrictionField =
  | "sourceIds"
  | "severities"
  | "statuses"
  | "labels"
  | "titleContains"
  | "messageContains";

export interface RouteRuleFormRestriction {
  field: RouteRuleFormRestrictionField;
  total: number;
  preserved: number;
}

export interface RouteRuleFormRestrictions {
  restricted: boolean;
  fields: RouteRuleFormRestriction[];
}

export function getRouteRuleFormRestrictions(rule: RouteRule): RouteRuleFormRestrictions {
  const candidates: Array<{ field: RouteRuleFormRestrictionField; total: number }> = [
    { field: "sourceIds", total: rule.sourceIds.length },
    { field: "severities", total: rule.severities.length },
    { field: "statuses", total: rule.statuses.length },
    { field: "labels", total: rule.labels.length },
    { field: "titleContains", total: rule.titleContains.length },
    { field: "messageContains", total: rule.messageContains.length },
  ];

  const fields = candidates
    .filter((candidate) => candidate.total > 1)
    .map((candidate) => ({
      field: candidate.field,
      total: candidate.total,
      preserved: candidate.total - 1,
    }));

  return {
    restricted: fields.length > 0,
    fields,
  };
}

export function routeRulePatchFromForm(baseRule: RouteRule, data: FormData): RouteRule {
  return routeRulePatchFromValues(baseRule, routeFormValuesFromForm(data));
}

export function routeRulePatchFromValues(
  baseRule: RouteRule,
  values: RouteRuleFormValues,
): RouteRule {
  const edited = routeRuleFromValues(values);

  return {
    sourceIds: replaceFirstCondition(baseRule.sourceIds, edited.sourceIds),
    severities: replaceFirstCondition(baseRule.severities, edited.severities),
    statuses: replaceFirstCondition(baseRule.statuses, edited.statuses),
    labels: replaceFirstCondition(baseRule.labels, edited.labels),
    titleContains: replaceFirstCondition(baseRule.titleContains, edited.titleContains),
    messageContains: replaceFirstCondition(baseRule.messageContains, edited.messageContains),
  };
}

export interface RouteFormDefaults {
  sourceId: string;
  severity: RouteRule["severities"][number] | "any";
  status: RouteRule["statuses"][number] | "any";
  labelKey: string;
  labelOperator: RouteRule["labels"][number]["operator"];
  labelValue: string;
  titleContains: string;
  messageContains: string;
}

export type RouteRuleFormValues = RouteFormDefaults;

function replaceFirstCondition<T>(existing: T[], edited: T[]): T[] {
  if (existing.length === 0) {
    return edited;
  }

  if (edited.length === 0) {
    return existing.slice(1);
  }

  return [edited[0]!, ...existing.slice(1)];
}
