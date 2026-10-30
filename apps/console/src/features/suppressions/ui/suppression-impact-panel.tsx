import type { ReactNode } from "react";

import type { SuppressionImpactOutput } from "@tocsin/api";

import { ContentPanel } from "#/components/common/content-panel";
import { Badge } from "#/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { DestinationKindBadge } from "#/features/destinations/ui/destination-kind-badge";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The blast radius of one rule, aggregated over its whole window.
 *
 * Answers the review question the paged hits table cannot: how many alerts,
 * sources, and destinations this rule actually muted, when it first and last
 * fired, and which destination absorbed most of the silenced volume. The
 * counts share the hits table's predicate (`suppression_id`), so the two
 * panels cannot disagree about which notifications belong to the rule.
 */
export function SuppressionImpactPanel({ impact }: { impact: SuppressionImpactOutput }) {
  const t = useTranslations();

  return (
    <ContentPanel title={t("suppressions.impact.title")}>
      {impact.deliveryCount === 0 ? (
        <Empty className="border-none p-4">
          <EmptyHeader>
            <EmptyTitle>{t("suppressions.impact.empty.title")}</EmptyTitle>
            <EmptyDescription>{t("suppressions.impact.empty.description")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ImpactTerm label={t("suppressions.impact.terms.deliveries")}>
              {impact.deliveryCount}
            </ImpactTerm>
            <ImpactTerm label={t("suppressions.impact.terms.events")}>
              {impact.eventCount}
            </ImpactTerm>
            <ImpactTerm label={t("suppressions.impact.terms.sources")}>
              {impact.sourceCount}
            </ImpactTerm>
            <ImpactTerm label={t("suppressions.impact.terms.destinations")}>
              {impact.destinationCount}
            </ImpactTerm>
          </dl>
          {impact.firstHitAt && impact.lastHitAt ? (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span>
                {t("suppressions.impact.firstHit")}{" "}
                <OperationTimestamp format="dateTime" value={impact.firstHitAt} />
              </span>
              <span aria-hidden>·</span>
              <span>
                {t("suppressions.impact.lastHit")}{" "}
                <OperationTimestamp format="dateTime" value={impact.lastHitAt} />
              </span>
            </div>
          ) : null}
          {impact.severities.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">
                {t("suppressions.impact.bySeverity")}
              </span>
              <div className="flex flex-wrap gap-1">
                {impact.severities.map((row) => (
                  <Badge key={row.severity} variant="outline" className="font-normal">
                    {t(`common.severity.${row.severity}`)}
                    <span aria-hidden>·</span>
                    <span className="font-mono">{row.deliveryCount}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px]">
              {t("suppressions.impact.byDestination")}
            </span>
            <ul className="flex flex-col">
              {impact.destinations.map((destination) => (
                <li
                  key={destination.destinationId}
                  className="border-border/60 flex items-center justify-between gap-2 border-b py-1 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-medium">
                      {destination.destinationName}
                    </span>
                    <DestinationKindBadge kind={destination.kind} />
                  </div>
                  <span className="font-mono text-xs font-medium">{destination.deliveryCount}</span>
                </li>
              ))}
            </ul>
            {impact.destinationCount > impact.destinations.length ? (
              <span className="text-muted-foreground text-[11px]">
                {t("suppressions.impact.moreDestinations", {
                  count: impact.destinationCount - impact.destinations.length,
                })}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </ContentPanel>
  );
}

function ImpactTerm({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="mt-1 truncate font-mono text-sm font-semibold">{children}</dd>
    </div>
  );
}
