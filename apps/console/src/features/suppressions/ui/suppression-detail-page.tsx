import { RiArrowLeftLine } from "@remixicon/react";
import { useSuspenseQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { suppressionStateAt } from "@tocsin/core";

import { ContentPanel } from "#/components/common/content-panel";
import { PageToolbar } from "#/components/common/page-toolbar";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import {
  suppressionHitsQueryOptions,
  suppressionQueryOptions,
} from "#/features/suppressions/api/suppression.queries";
import {
  buildSuppressionMatcherChips,
  type SuppressionSummaryCopy,
} from "#/features/suppressions/model/suppression-summary";
import { SuppressionHitsTable } from "#/features/suppressions/ui/suppression-hits-table";
import { SuppressionStateBadge } from "#/features/suppressions/ui/suppression-state-badge";
import { useTranslations } from "#/i18n/use-i18n";
import { useOperationalNow } from "#/i18n/use-operational-now";
import { cn } from "#/lib/utils";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function SuppressionDetailPage({ suppressionId }: { suppressionId: string }) {
  const t = useTranslations();
  // The console's shared clock, so the derived state re-renders as time passes
  // instead of freezing a `new Date()` taken during render.
  const now = useOperationalNow();
  const [hitsPage, setHitsPage] = React.useState(1);
  const [{ data: suppression }, { data: hits }, { data: sources }, { data: destinations }] =
    useSuspenseQueries({
      queries: [
        suppressionQueryOptions(suppressionId),
        suppressionHitsQueryOptions(suppressionId, hitsPage),
        sourcesQueryOptions(),
        destinationsQueryOptions(),
      ],
    });

  const copy = suppressionSummaryCopy(t);
  const chips = buildSuppressionMatcherChips(
    suppression.matcher,
    {
      source: (sourceId) =>
        sources.find((source) => source.id === sourceId)?.name ?? sourceId.slice(0, 10),
      destination: (destinationId) =>
        destinations.find((destination) => destination.id === destinationId)?.name ??
        destinationId.slice(0, 10),
    },
    copy,
  );

  return (
    <DashboardContentLayout
      main={
        <>
          <PageToolbar
            title={suppression.name}
            description={t("suppressions.detail.description")}
            badge={suppression.id}
            actions={
              <Link
                to="/suppressions"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
              >
                <RiArrowLeftLine data-icon="inline-start" aria-hidden />
                {t("suppressions.detail.back")}
              </Link>
            }
          />
          <ContentPanel title={t("suppressions.detail.rulePanelTitle")}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <SuppressionStateBadge state={suppressionStateAt(suppression, now.toISOString())} />
                <Badge variant="outline">{t(`suppressions.kind.${suppression.kind}`)}</Badge>
                <Badge variant="outline">
                  {t(`common.state.${suppression.enabled ? "enabled" : "disabled"}`)}
                </Badge>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailTerm label={t("suppressions.detail.terms.startsAt")}>
                  <OperationTimestamp format="dateTime" value={suppression.startsAt} />
                </DetailTerm>
                <DetailTerm label={t("suppressions.detail.terms.endsAt")}>
                  <OperationTimestamp format="dateTime" value={suppression.endsAt} />
                </DetailTerm>
                <DetailTerm label={t("suppressions.detail.terms.reason")}>
                  {suppression.reason ?? t("suppressions.detail.noReason")}
                </DetailTerm>
                <DetailTerm label={t("suppressions.detail.terms.createdBy")}>
                  {suppression.createdBy ?? t("suppressions.detail.unknownCreator")}
                </DetailTerm>
              </dl>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[11px]">
                  {t("suppressions.detail.terms.matcher")}
                </span>
                {chips.length === 0 ? (
                  <Badge variant="destructive" className="w-fit">
                    {t("suppressions.table.everything")}
                  </Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {chips.map((chip) => (
                      <Badge key={chip} variant="outline" className="font-mono text-[11px]">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ContentPanel>
          <SuppressionHitsTable hits={hits} page={hitsPage} onPageChange={setHitsPage} />
        </>
      }
    />
  );
}

function DetailTerm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="mt-1 truncate text-xs font-medium">{children}</dd>
    </div>
  );
}

function suppressionSummaryCopy(t: ReturnType<typeof useTranslations>): SuppressionSummaryCopy {
  return {
    everything: t("suppressions.matcher.everything"),
    source: t("suppressions.matcher.source"),
    destination: t("suppressions.matcher.destination"),
    severity: t("suppressions.matcher.severity"),
    status: t("suppressions.matcher.status"),
    fingerprint: t("suppressions.matcher.fingerprint"),
    labels: t("suppressions.matcher.labels"),
    titleContains: t("suppressions.matcher.titleContains"),
    messageContains: t("suppressions.matcher.messageContains"),
    severityLabel: (severity) => t(`common.severity.${severity}`),
    statusLabel: (status) => t(`common.alertStatus.${status}`),
  };
}
