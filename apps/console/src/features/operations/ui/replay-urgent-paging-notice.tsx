import { RiAlarmWarningLine } from "@remixicon/react";

import type { ReplayUrgentPagingImpact } from "@tocsin/core";

import { useTranslations } from "#/i18n/use-i18n";

/**
 * The urgent phone calls a replay can place, shown before the operator
 * confirms.
 *
 * Replay itself is reversible — deliveries can be inspected and the targets
 * are listed next to this notice — but a page to someone's phone is not. The
 * preview is an upper bound: the delivery still has to succeed and return a
 * message reference, and the paging dedupe window can drop receivers, so the
 * copy says "may" rather than promising calls.
 */
export function ReplayUrgentPagingNotice({ impact }: { impact: ReplayUrgentPagingImpact }) {
  const t = useTranslations();

  if (impact.deliveryCount === 0) {
    return null;
  }

  const destinations = impact.destinations
    .map((destination) => `${destination.destinationName} ×${destination.receiverCount}`)
    .join(" · ");

  return (
    <div
      role="note"
      className="border-destructive/40 bg-destructive/5 flex flex-col gap-1 border p-2"
    >
      <p className="text-destructive flex items-center gap-1 text-xs font-medium">
        <RiAlarmWarningLine data-icon="inline-start" aria-hidden />
        {t("operations.replayUrgentPaging.title", {
          calls: impact.receiverCount,
          deliveries: impact.deliveryCount,
        })}
      </p>
      <p className="text-muted-foreground text-[11px] leading-5">
        {t("operations.replayUrgentPaging.destinations", { destinations })}
      </p>
      <p className="text-muted-foreground text-[11px] leading-5">
        {t("operations.replayUrgentPaging.note")}
      </p>
    </div>
  );
}
