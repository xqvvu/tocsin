import { RiDatabase2Line } from "@remixicon/react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Explains why the payload tab cannot show the raw alert payload.
 *
 * The retention sweep replaces `rawPayload` with an internal placeholder. The
 * rendered payload is persisted on the delivery and stays available, so the
 * operator still sees what was actually sent.
 */
export function DeliveryPayloadPrunedNotice() {
  const t = useTranslations();

  return (
    <Alert>
      <RiDatabase2Line aria-hidden />
      <AlertTitle>{t("deliveries.detail.rawPruned.title")}</AlertTitle>
      <AlertDescription>{t("deliveries.detail.rawPruned.description")}</AlertDescription>
    </Alert>
  );
}
