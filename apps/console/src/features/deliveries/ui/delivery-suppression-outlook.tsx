import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  evaluateSuppressionMatch,
  isUnconditionalSuppressionMatcher,
  suppressionStateAt,
} from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import { containsRedactedValue } from "#/features/deliveries/model/delivery-route-evidence";
import { DeliveryDetailSectionHeader } from "#/features/deliveries/ui/delivery-detail-section-header";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { RouteMatchCheckBadges } from "#/features/routes/ui/route-match-check-badges";
import { RouteMatchResultBadge } from "#/features/routes/ui/route-match-result-badge";
import { suppressionsQueryOptions } from "#/features/suppressions/api/suppression.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * "Why was this *not* silenced?" for a delivery that went out (PRD story 26).
 *
 * The delivery only records suppression evidence when a rule claimed it, so the
 * other half of the question has to be replayed: read the rules in force at the
 * delivery's creation time and run the same core evaluator the intake path
 * used. Two honesty limits are stated in the copy rather than hidden:
 * `enabled` is the rule's current value, not a historical one, and a redacted
 * event cannot be replayed at all.
 */
export function DeliverySuppressionOutlook({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const at = detail.job.createdAt;
  const rules = useQuery(suppressionsQueryOptions());
  const redacted = containsRedactedValue(detail.event.normalized);

  const evaluations = redacted
    ? []
    : (rules.data ?? [])
        .filter((rule) => suppressionStateAt(rule, at) === "active")
        .map((rule) => ({
          rule,
          result: evaluateSuppressionMatch(rule, {
            sourceId: detail.event.sourceId,
            destinationId: detail.job.destinationId,
            event: {
              severity: detail.event.normalized.severity,
              status: detail.event.normalized.status,
              fingerprint: detail.event.normalized.fingerprint,
              title: detail.event.normalized.title,
              message: detail.event.normalized.message,
              labels: detail.event.normalized.labels,
            },
          }),
        }))
        // Closest miss first: the rule the operator most likely expected to
        // fire is the one that failed the fewest conditions.
        .sort(
          (left, right) =>
            countMisses(left.result.checks) - countMisses(right.result.checks) ||
            left.rule.startsAt.localeCompare(right.rule.startsAt) ||
            left.rule.id.localeCompare(right.rule.id),
        );

  const matched = evaluations.filter(({ result }) => result.matched);

  return (
    <section className="border-border bg-background flex min-w-0 flex-col border">
      <DeliveryDetailSectionHeader title={t("deliveries.suppressionOutlook.title")} />
      <div className="grid gap-2 p-3 text-xs">
        {rules.isError ? (
          <p className="text-muted-foreground">{t("deliveries.suppressionOutlook.error")}</p>
        ) : null}

        {!rules.isError && rules.isPending ? (
          <p className="text-muted-foreground">{t("deliveries.suppressionOutlook.loading")}</p>
        ) : null}

        {!rules.isError && !rules.isPending && redacted ? (
          <p className="text-muted-foreground">{t("deliveries.suppressionOutlook.redacted")}</p>
        ) : null}

        {!rules.isError && !rules.isPending && !redacted ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {matched.length > 0 ? (
                <Badge variant="destructive">
                  {t("deliveries.suppressionOutlook.wouldSilence")}
                </Badge>
              ) : (
                <Badge variant="outline">{t("deliveries.suppressionOutlook.notSilenced")}</Badge>
              )}
              <span className="text-muted-foreground text-[11px]">
                {t("deliveries.suppressionOutlook.replayAt")}{" "}
                <OperationTimestamp format="dateTime" value={at} /> ·{" "}
                {t("deliveries.suppressionOutlook.activeRules", { count: evaluations.length })}
              </span>
            </div>

            {evaluations.length === 0 ? (
              <p className="text-muted-foreground">
                {t("deliveries.suppressionOutlook.noActiveRules")}
              </p>
            ) : null}

            {evaluations.length > 0 && matched.length === 0 ? (
              <p className="text-muted-foreground">{t("deliveries.suppressionOutlook.noMatch")}</p>
            ) : null}

            {matched.length > 0 ? (
              <p className="text-muted-foreground">
                {t("deliveries.suppressionOutlook.driftHint")}
              </p>
            ) : null}

            {evaluations.length > 0 ? (
              <ul className="grid gap-2">
                {evaluations.map(({ rule, result }) => (
                  <li key={rule.id} className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link
                        to="/suppressions/$suppressionId"
                        params={{ suppressionId: rule.id }}
                        className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
                        title={rule.name}
                      >
                        {rule.name}
                      </Link>
                      <RouteMatchResultBadge matched={result.matched} />
                      {isUnconditionalSuppressionMatcher(rule.matcher) ? (
                        <span className="text-muted-foreground">
                          {t("deliveries.suppressionOutlook.unconditional")}
                        </span>
                      ) : null}
                    </div>
                    <RouteMatchCheckBadges checks={visibleChecks(result.checks, result.matched)} />
                  </li>
                ))}
              </ul>
            ) : null}

            {evaluations.length > 0 ? (
              <p className="text-muted-foreground text-[11px]">
                {t("deliveries.suppressionOutlook.enabledHint")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function countMisses(checks: { matched: boolean }[]): number {
  return checks.filter((check) => !check.matched).length;
}

/**
 * A matched rule with conditions needs no badge per condition; an unconditional
 * rule has nothing to show. A miss is only useful as the conditions that failed.
 */
function visibleChecks<T extends { matched: boolean; condition?: string }>(
  checks: T[],
  matched: boolean,
): T[] {
  return matched
    ? checks.filter((check) => check.condition !== "none")
    : checks.filter((check) => !check.matched);
}
