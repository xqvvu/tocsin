import { CopyableCodeLine } from "#/components/common/copyable-code-line";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Receipt for one delivery in the event detail table.
 *
 * An operator asking "did this alert actually reach the target?" needed the
 * delivery detail page per destination to answer it. The receipt is the two
 * facts that page carried: the target's handle for the message and the status
 * and time of the latest completed attempt. Everything else (payload, headers,
 * response body) stays on the delivery detail.
 */
export function EventDetailDeliveryReceiptCell({
  delivery,
}: {
  delivery: EventDetailData["deliveries"][number];
}) {
  const t = useTranslations();
  const { providerReference, lastResponseStatus, lastResponseAt } = delivery;

  if (providerReference === null && lastResponseStatus === null && lastResponseAt === null) {
    return "-";
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {providerReference === null ? null : (
        <CopyableCodeLine
          value={providerReference.value}
          copyValue={providerReference.value}
          copyLabel={t("events.detail.receipt.copyReference")}
          tooltipValue={`${providerReference.type}: ${providerReference.value}`}
          wrap
        />
      )}
      {lastResponseStatus === null && lastResponseAt === null ? null : (
        <span className="text-muted-foreground text-xs">
          {lastResponseStatus === null
            ? null
            : t("events.detail.receipt.httpStatus", { status: lastResponseStatus })}
          {lastResponseStatus !== null && lastResponseAt !== null ? " · " : null}
          {lastResponseAt === null ? null : (
            <OperationTimestamp format="time" value={lastResponseAt} />
          )}
        </span>
      )}
    </div>
  );
}
