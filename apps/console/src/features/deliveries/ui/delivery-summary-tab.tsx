import { summarizeDeliveryTiming } from "#/features/deliveries/model/delivery-diagnostics";
import { DeliveryDetailSectionHeader } from "#/features/deliveries/ui/delivery-detail-section-header";
import { DeliveryDetailTerm } from "#/features/deliveries/ui/delivery-detail-term";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliverySummaryTab({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const timing = summarizeDeliveryTiming(detail.job, detail.attempts);

  return (
    <section className="border-border bg-background flex min-h-0 min-w-0 flex-col overflow-hidden border">
      <DeliveryDetailSectionHeader title={t("deliveries.detail.sections.fields")} />
      <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2 p-3 text-xs lg:max-w-3xl">
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.destination")}
          value={detail.destination.name}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.kind")}
          value={t(`destinations.kinds.${detail.destination.kind}`)}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.route")}
          value={detail.route?.name ?? t("deliveries.detail.manual")}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.source")}
          value={detail.source.name}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.event")}
          value={detail.event.normalized.title}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.deliveryId")}
          value={detail.job.id}
          mono
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.eventId")}
          value={detail.event.id}
          mono
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.providerReference")}
          value={detail.providerReference?.value ?? "-"}
          copyValue={detail.providerReference?.value}
          copyLabel={t("deliveries.detail.actions.copyProviderReference")}
          hint={detail.providerReference?.type}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.state")}
          value={t(`common.deliveryState.${detail.job.state}`)}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.attempts")}
          value={`${detail.job.attemptCount}/${detail.job.maxAttempts}`}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.created")}
          value={<OperationTimestamp format="dateTime" value={detail.job.createdAt} />}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.finished")}
          value={
            detail.job.finishedAt ? (
              <OperationTimestamp format="dateTime" value={detail.job.finishedAt} />
            ) : (
              "-"
            )
          }
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.queueLatency")}
          value={timing.queueLatency ?? "-"}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.sendDuration")}
          value={timing.sendDuration ?? "-"}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.endToEndDuration")}
          value={timing.endToEndDuration ?? "-"}
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.nextAttempt")}
          value={
            detail.job.nextAttemptAt ? (
              <OperationTimestamp format="dateTime" value={detail.job.nextAttemptAt} />
            ) : (
              "-"
            )
          }
        />
        <DeliveryDetailTerm
          label={t("deliveries.detail.terms.lastError")}
          value={detail.job.lastError ?? "-"}
        />
      </dl>
    </section>
  );
}
