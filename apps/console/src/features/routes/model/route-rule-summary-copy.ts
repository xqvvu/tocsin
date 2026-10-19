import type { RouteRuleSummaryCopy } from "#/features/routes/model/route-rule-summary";
import type { useTranslations } from "#/i18n/use-i18n";

/**
 * Build the locale-agnostic copy object that `describeRouteRule` and
 * `buildRouteRuleChips` accept. Kept out of the formatting module so that
 * module stays free of the i18n runtime and can be reused by any surface.
 */
export function routeRuleSummaryCopy(t: ReturnType<typeof useTranslations>): RouteRuleSummaryCopy {
  return {
    allEvents: t("routing.table.allEvents"),
    source: t("routing.table.rulePrefix.source"),
    severity: t("routing.table.rulePrefix.severity"),
    status: t("routing.table.rulePrefix.status"),
    labels: t("routing.table.rulePrefix.labels"),
    title: t("routing.table.rulePrefix.title"),
    message: t("routing.table.rulePrefix.message"),
    sourcesCount: (count) => t("routing.table.ruleSummary.sourcesCount", { count }),
    titleContains: t("routing.table.ruleSummary.titleContains"),
    messageContains: t("routing.table.ruleSummary.messageContains"),
    partSeparator: t("routing.table.ruleSummary.partSeparator"),
    listSeparator: t("routing.table.ruleSummary.listSeparator"),
    severityLabel: (severity) => t(`common.severity.${severity}`),
    statusLabel: (status) => t(`common.alertStatus.${status}`),
  };
}
