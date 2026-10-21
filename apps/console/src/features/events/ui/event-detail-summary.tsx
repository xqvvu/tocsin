import type { ReactNode } from "react";

import { REDACTED_VALUE, type DeliveryState } from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import { DELIVERY_STATE_PRIORITY } from "#/features/events/model/delivery-priority";
import type { getEventDeliveryStats } from "#/features/events/ui/event-detail-stats";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { SeverityBadge } from "#/features/events/ui/severity-badge";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { SuppressionFromEventDialog } from "#/features/suppressions/ui/suppression-from-event-dialog";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

const DELIVERY_HEALTH_MESSAGE_KEYS: Record<DeliveryState, string> = {
  failed: "events.detail.summary.deliveryHealthFailed",
  running: "events.detail.summary.deliveryHealthRunning",
  pending: "events.detail.summary.deliveryHealthPending",
  succeeded: "events.detail.summary.deliveryHealthSucceeded",
  suppressed: "events.detail.summary.deliveryHealthSuppressed",
};

const DELIVERY_HEALTH_VARIANTS: Record<DeliveryState, "destructive" | "secondary" | "outline"> = {
  failed: "destructive",
  running: "secondary",
  pending: "secondary",
  succeeded: "outline",
  suppressed: "outline",
};

export function EventDetailSummary({
  detail,
  matchedRouteCount,
  deliveryStats,
}: {
  detail: EventDetailData;
  matchedRouteCount: number;
  deliveryStats: ReturnType<typeof getEventDeliveryStats>;
}) {
  const t = useTranslations();
  const normalized = detail.event.normalized;
  const deliveryTotal = Object.values(deliveryStats).reduce((total, count) => total + count, 0);
  const titleSilence = textSilenceState(normalized.title);
  const messageSilence = textSilenceState(normalized.message);
  const titleField = t("suppressions.fromText.fieldTitle");
  const messageField = t("suppressions.fromText.fieldMessage");

  return (
    <section className="border-border bg-card shrink-0 border">
      <div className="border-border flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <SeverityBadge severity={normalized.severity} />
            <AlertStatusBadge status={normalized.status} />
          </div>
          <div className="flex min-w-0 items-start gap-1.5">
            <h2 className="min-w-0 flex-1 text-sm leading-5 font-semibold wrap-break-word">
              {normalized.title}
            </h2>
            <SuppressionFromEventDialog
              event={detail.event}
              source={detail.source}
              text={{ field: "title", value: normalized.title }}
              disabled={titleSilence !== "ok"}
              disabledReason={
                titleSilence === "empty"
                  ? t("suppressions.fromText.disabled.empty", { field: titleField })
                  : titleSilence === "redacted"
                    ? t("suppressions.fromText.disabled.redacted", { field: titleField })
                    : undefined
              }
            />
          </div>
          <div className="mt-1 flex min-w-0 items-start gap-1.5">
            <p className="text-muted-foreground max-w-4xl min-w-0 flex-1 text-xs leading-5 wrap-break-word">
              {normalized.message}
            </p>
            <SuppressionFromEventDialog
              event={detail.event}
              source={detail.source}
              text={{ field: "message", value: normalized.message }}
              disabled={messageSilence !== "ok"}
              disabledReason={
                messageSilence === "empty"
                  ? t("suppressions.fromText.disabled.empty", { field: messageField })
                  : messageSilence === "redacted"
                    ? t("suppressions.fromText.disabled.redacted", { field: messageField })
                    : undefined
              }
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Badge variant="outline">
            {t("events.detail.summary.routeMatches", {
              matched: matchedRouteCount,
              total: detail.routeMatches.length,
            })}
          </Badge>
          {deliveryTotal === 0 ? (
            <Badge variant="outline">{t("events.detail.summary.deliveryHealthNone")}</Badge>
          ) : (
            DELIVERY_STATE_PRIORITY.filter((state) => deliveryStats[state] > 0).map((state) => (
              <Badge key={state} variant={DELIVERY_HEALTH_VARIANTS[state]}>
                {t(DELIVERY_HEALTH_MESSAGE_KEYS[state], {
                  count: deliveryStats[state],
                })}
              </Badge>
            ))
          )}
        </div>
      </div>
      <div className="bg-border grid gap-px sm:grid-cols-2 lg:grid-cols-5">
        <SummaryMetric label={t("events.detail.terms.source")} value={detail.source.name} />
        <SummaryMetric
          label={t("events.detail.terms.fingerprint")}
          value={normalized.fingerprint}
          mono
        />
        <SummaryMetric
          label={t("events.detail.terms.occurred")}
          value={<OperationTimestamp format="dateTime" value={normalized.occurredAt} />}
        />
        <SummaryMetric
          label={t("events.detail.terms.received")}
          value={<OperationTimestamp format="dateTime" value={detail.event.receivedAt} />}
        />
        <SummaryMetric
          label={t("events.detail.terms.deliveries")}
          value={t("events.detail.summary.deliveries", { count: detail.deliveries.length })}
        />
      </div>
    </section>
  );
}

/**
 * Whether the displayed text can be used as a suppression needle.
 *
 * An empty fragment is dropped by `suppressionMatcherFromValues`, turning the
 * rule into "silence everything from this source"; redacted text no longer
 * equals the stored value, so the rule would never fire.
 */
function textSilenceState(value: string): "ok" | "empty" | "redacted" {
  if (value.trim().length === 0) {
    return "empty";
  }

  return value.includes(REDACTED_VALUE) ? "redacted" : "ok";
}

function AlertStatusBadge({
  status,
}: {
  status: EventDetailData["event"]["normalized"]["status"];
}) {
  const t = useTranslations();

  return (
    <Badge variant={status === "firing" ? "destructive" : "secondary"}>
      {t("events.detail.summary.alertStatus", {
        status: t(`common.alertStatus.${status}`),
      })}
    </Badge>
  );
}

function SummaryMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="bg-card min-w-0 px-3 py-2.5">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div
        className={cn(
          "mt-1 text-xs leading-4 font-medium wrap-break-word",
          mono ? "font-mono text-[11px]" : null,
        )}
      >
        {value}
      </div>
    </div>
  );
}
