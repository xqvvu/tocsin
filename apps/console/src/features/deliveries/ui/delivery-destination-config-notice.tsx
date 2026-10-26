import { RiHistoryLine } from "@remixicon/react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { formatDateTime } from "#/features/operations/model/operation-format";
import { useLocale, useTranslations, useTimeZone } from "#/i18n/use-i18n";

/**
 * "This target is not what the send used" for a destination edited afterwards.
 *
 * The detail DTO projects the destination as it exists at read time; Tocsin
 * keeps no send-time config snapshot. Without this notice an operator reading
 * an old delivery mistakes today's endpoint and recipients for the ones that
 * were actually used, which is misleading evidence during an incident.
 */
export function DeliveryDestinationConfigNotice({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const deliveryAt = detail.job.finishedAt ?? detail.job.createdAt;

  if (Date.parse(detail.destinationUpdatedAt) <= Date.parse(deliveryAt)) {
    return null;
  }

  return (
    <Alert>
      <RiHistoryLine aria-hidden />
      <AlertTitle>{t("deliveries.configNotice.title")}</AlertTitle>
      <AlertDescription>
        <p>{t("deliveries.configNotice.description")}</p>
        <p className="text-muted-foreground mt-1 text-xs">
          {t("deliveries.configNotice.times", {
            destination: formatDateTime(detail.destinationUpdatedAt, { locale, timeZone }),
            delivery: formatDateTime(deliveryAt, { locale, timeZone }),
          })}
        </p>
      </AlertDescription>
    </Alert>
  );
}
