import { RiAlarmWarningLine } from "@remixicon/react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
  explainMissingUrgentPings,
  type MissingUrgentPingReason,
} from "#/features/deliveries/model/urgent-ping-explanation";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { useTranslations } from "#/i18n/use-i18n";

type Translator = ReturnType<typeof useTranslations>;

/**
 * "Why was nobody called?" for a delivery without urgent pings.
 *
 * The trigger's gates return silently by design, so the page reconstructs the
 * first gate that stopped paging. The verdict is read from the destination's
 * current metadata, and the note says so instead of presenting it as a
 * snapshot of what the trigger saw.
 */
export function DeliveryUrgentPingExplanation({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const reason = explainMissingUrgentPings(detail);

  return (
    <Alert>
      <RiAlarmWarningLine aria-hidden />
      <AlertTitle>{t("deliveries.detail.pingsExplanation.title")}</AlertTitle>
      <AlertDescription>
        <p>{reason ? describeReason(reason, t) : t("deliveries.detail.pingsEmpty")}</p>
        {reason && reason.code !== "not_created" ? (
          <p className="text-muted-foreground mt-1 text-[11px]">
            {t("deliveries.detail.pingsExplanation.currentConfigNote")}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function describeReason(reason: MissingUrgentPingReason, t: Translator): string {
  switch (reason.code) {
    case "not_feishu":
      return t("deliveries.detail.pingsExplanation.notFeishu");
    case "delivery_not_succeeded":
      return t("deliveries.detail.pingsExplanation.notSucceeded", {
        state: t(`common.deliveryState.${reason.state}`),
      });
    case "webhook_mode":
      return t("deliveries.detail.pingsExplanation.webhookMode");
    case "no_provider_reference":
      return t("deliveries.detail.pingsExplanation.noProviderReference");
    case "auto_disabled":
      return t("deliveries.detail.pingsExplanation.autoDisabled");
    case "no_receivers":
      return t("deliveries.detail.pingsExplanation.noReceivers");
    case "not_firing":
      return t("deliveries.detail.pingsExplanation.notFiring", {
        status: t(`common.alertStatus.${reason.status}`),
      });
    case "severity_excluded":
      return t("deliveries.detail.pingsExplanation.severityExcluded", {
        severity: t(`common.severity.${reason.severity}`),
        severities: reason.severities
          .map((severity) => t(`common.severity.${severity}`))
          .join("、"),
      });
    case "not_created":
      return t("deliveries.detail.pingsExplanation.notCreated");
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}
