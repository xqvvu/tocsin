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

  // No faint destructive tint behind the text. `bg-destructive/5` darkened the
  // surface just enough to drop the 12px title to a 4.36:1 contrast ratio and
  // the 11px note to 4.34:1, both under the 4.5:1 AA threshold — on the one
  // notice where misreading "may call N receivers" precedes an irreversible
  // phone page. The red border, red title and warning icon carry the urgency;
  // on the plain background both lines measure 4.74:1 or better.
  return (
    <div role="note" className="border-destructive/40 flex flex-col gap-1 border p-2">
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
