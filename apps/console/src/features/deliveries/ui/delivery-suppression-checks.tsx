import { useQuery } from "@tanstack/react-query";

import { evaluateSuppressionMatch } from "@tocsin/core";

import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { RouteMatchCheckBadges } from "#/features/routes/ui/route-match-check-badges";
import { RouteMatchResultBadge } from "#/features/routes/ui/route-match-result-badge";
import { suppressionQueryOptions } from "#/features/suppressions/api/suppression.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Per-condition evidence for "why was this delivery suppressed?".
 *
 * The delivery stores only a reason snapshot. The conditions live on the rule,
 * so this reads the current rule and re-runs the same core evaluator the intake
 * path used. Recomputing keeps this read-only and migration-free, but it also
 * means the rule may have changed: the copy says so, and the reason snapshot
 * stays the audit record. A missing or unreadable rule renders nothing — the
 * notice above already explains that state.
 */
export function DeliverySuppressionChecks({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const suppressionId = detail.job.suppressionId;
  const rule = useQuery({
    ...suppressionQueryOptions(suppressionId ?? ""),
    enabled: suppressionId !== null,
  });

  if (!suppressionId || rule.isError || !rule.data) {
    return null;
  }

  const result = evaluateSuppressionMatch(
    { id: rule.data.id, name: rule.data.name, matcher: rule.data.matcher },
    {
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
    },
  );

  return (
    <div className="mt-2 grid gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium">{t("deliveries.suppression.checksTitle")}</span>
        <RouteMatchResultBadge matched={result.matched} />
      </div>
      <RouteMatchCheckBadges checks={result.checks} />
      <p className="text-muted-foreground text-xs/relaxed">
        {result.matched
          ? t("deliveries.suppression.checksHint")
          : t("deliveries.suppression.checksMismatch")}
      </p>
    </div>
  );
}
