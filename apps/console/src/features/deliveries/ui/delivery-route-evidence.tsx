import { buildDeliveryRouteEvidence } from "#/features/deliveries/model/delivery-route-evidence";
import { DeliveryDetailSectionHeader } from "#/features/deliveries/ui/delivery-detail-section-header";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { describeRouteRule } from "#/features/routes/model/route-rule-summary";
import { routeRuleSummaryCopy } from "#/features/routes/model/route-rule-summary-copy";
import { RouteMatchCheckBadges } from "#/features/routes/ui/route-match-check-badges";
import { RouteMatchResultBadge } from "#/features/routes/ui/route-match-result-badge";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Explains why a route selected this delivery.
 *
 * The intake snapshot is immutable evidence of the rule at ingest time; the
 * current rule is read live and may have been edited since. Showing both — and
 * stating when they disagree — answers "why was this sent?" without asking the
 * operator to reconstruct it from the event page.
 */
export function DeliveryRouteEvidence({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const evidence = buildDeliveryRouteEvidence(detail);

  if (!evidence) {
    return null;
  }

  const copy = routeRuleSummaryCopy(t);

  return (
    <section className="border-border bg-background flex min-w-0 flex-col border">
      <DeliveryDetailSectionHeader title={t("deliveries.detail.routeEvidence.title")} />
      <div className="grid gap-4 p-3 text-xs lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-muted-foreground font-medium">
              {t("deliveries.detail.routeEvidence.snapshotTitle")}
            </h4>
            {evidence.snapshot ? (
              <RouteMatchResultBadge matched={evidence.snapshot.matched} />
            ) : null}
          </div>
          {evidence.snapshot ? (
            <>
              <p className="truncate font-medium" title={evidence.snapshot.routeName}>
                {evidence.snapshot.routeName}
              </p>
              <RouteMatchCheckBadges checks={evidence.snapshot.checks} />
              {evidence.snapshot.matched ? null : (
                <p className="text-muted-foreground">
                  {t("deliveries.detail.routeEvidence.snapshotMissed")}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              {evidence.hasSnapshot
                ? t("deliveries.detail.routeEvidence.snapshotAbsent")
                : t("deliveries.detail.routeEvidence.snapshotMissing")}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-muted-foreground font-medium">
              {t("deliveries.detail.routeEvidence.currentTitle")}
            </h4>
            {evidence.current ? <RouteMatchResultBadge matched={evidence.current.matched} /> : null}
          </div>
          {detail.route ? (
            <>
              <p className="truncate font-medium" title={detail.route.name}>
                {detail.route.name}
              </p>
              <p className="text-muted-foreground">{describeRouteRule(detail.route.rule, copy)}</p>
              {evidence.current ? (
                <>
                  <RouteMatchCheckBadges checks={evidence.current.checks} />
                  {evidence.current.matched ? null : (
                    <p className="text-muted-foreground">
                      {t("deliveries.detail.routeEvidence.currentMismatch")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {evidence.currentRedacted
                    ? t("deliveries.detail.routeEvidence.currentRedacted")
                    : t("deliveries.detail.routeEvidence.currentMissing")}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              {t("deliveries.detail.routeEvidence.currentMissing")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
