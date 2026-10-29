import { RiAlarmWarningLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";

import { destinationEnablePreviewQueryOptions } from "#/features/destinations/api/destination.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Scheduled urgent calls that start dialing when a destination is re-enabled.
 *
 * While a destination is disabled the urgent-call worker skips its scheduled
 * pings, so they accumulate. Enabling lifts the gate and the next worker tick
 * places them; a placed call cannot be recalled.
 *
 * The count is advisory: a failed or pending read renders nothing and never
 * blocks the enable itself. Zero renders nothing too, so the confirmation only
 * grows when there is something the operator cannot take back.
 */
export function DestinationScheduledUrgentNotice({ destinationId }: { destinationId: string }) {
  const t = useTranslations();
  const preview = useQuery(destinationEnablePreviewQueryOptions(destinationId));

  if (preview.isPending || preview.isError) {
    return null;
  }

  const count = preview.data.scheduledUrgentCallCount;

  if (count === 0) {
    return null;
  }

  // Same contrast reasoning as UrgentPagingNotice: no destructive tint behind
  // 11px text. The red border, red title, and warning icon carry the urgency.
  return (
    <div role="note" className="border-destructive/40 flex flex-col gap-1 border p-2">
      <p className="text-destructive flex items-center gap-1 text-xs font-medium">
        <RiAlarmWarningLine data-icon="inline-start" aria-hidden />
        {t("destinations.enable.scheduledUrgentTitle", { count })}
      </p>
      <p className="text-muted-foreground text-[11px] leading-5">
        {t("destinations.enable.scheduledUrgentNote")}
      </p>
    </div>
  );
}
