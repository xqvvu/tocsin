import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryJsonBlock } from "#/features/deliveries/ui/delivery-json-block";
import { DeliveryPayloadPrunedNotice } from "#/features/deliveries/ui/delivery-payload-pruned-notice";
import { RawPayloadRetentionNotice } from "#/features/operations/ui/raw-payload-retention-notice";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Compares what the source reported with what Tocsin rendered for the target.
 *
 * Both sides answer different on-call questions: the raw payload shows whether
 * the upstream sent the expected fields, the rendered payload shows exactly
 * what the destination template produced. Keeping them side by side removes a
 * cross-tab lookup during delivery triage.
 */
export function DeliveryPayloadTab({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="grid gap-2">
        <p className="border-border bg-background text-muted-foreground border px-3 py-2 text-xs">
          {t("deliveries.detail.payloadNotice")}
        </p>
        {/*
          The window belongs to the event's raw payload (the left column), not
          to the rendered payload, which is persisted on the delivery and
          survives the prune. The hint is only useful before the prune, so the
          pruned branch keeps its own explanation.
        */}
        {detail.rawPayloadPruned ? null : (
          <RawPayloadRetentionNotice receivedAt={detail.event.receivedAt} />
        )}
      </div>
      <div className="grid min-h-0 gap-3 lg:grid-cols-2">
        {detail.rawPayloadPruned ? (
          <DeliveryPayloadPrunedNotice />
        ) : (
          <DeliveryJsonBlock
            title={t("deliveries.detail.json.rawEventPayload")}
            value={detail.event.rawPayload}
          />
        )}
        <DeliveryJsonBlock
          title={t("deliveries.detail.json.renderedPayload")}
          value={detail.renderedPayload ?? {}}
        />
      </div>
    </div>
  );
}
