import type { DeliveryState } from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import type { DeliveryDetail } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveryStateBadge({ state }: { state: DeliveryState }) {
  const t = useTranslations();

  return (
    <Badge
      variant={state === "failed" ? "destructive" : state === "succeeded" ? "default" : "secondary"}
      className={deliveryStateBadgeClassName(state)}
    >
      {t(`common.deliveryState.${state}`)}
    </Badge>
  );
}

/**
 * `suppressed` must never be mistaken for `failed` ("we chose not to send" versus
 * "sending broke", PRD story 25), so it is outlined and muted rather than red,
 * matching how the paging table already renders its own suppressed pings.
 */
function deliveryStateBadgeClassName(state: DeliveryState): string | undefined {
  return state === "suppressed" ? "border-muted-foreground/40 text-muted-foreground" : undefined;
}

export function DeliveryAttemptStateBadge({
  state,
}: {
  state: NonNullable<DeliveryDetail>["attempts"][number]["state"];
}) {
  const t = useTranslations();

  return (
    <Badge
      variant={state === "failed" ? "destructive" : state === "succeeded" ? "default" : "secondary"}
    >
      {t(`common.deliveryState.${state}`)}
    </Badge>
  );
}

/** Urgent phone paging state: a fired call is the success case, not a delivery. */
export function DeliveryPingStateBadge({
  state,
}: {
  state: NonNullable<DeliveryDetail>["pings"][number]["state"];
}) {
  const t = useTranslations();
  const variant =
    state === "fired"
      ? "default"
      : state === "failed"
        ? "destructive"
        : state === "suppressed"
          ? "outline"
          : "secondary";

  return <Badge variant={variant}>{t(`deliveries.pingState.${state}`)}</Badge>;
}
