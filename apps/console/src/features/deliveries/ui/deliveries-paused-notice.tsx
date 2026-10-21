import { RiPlayLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { DeliveryResumeDialog } from "#/features/configuration/ui/delivery-resume-dialog";
import { formatDateTime } from "#/features/operations/model/operation-format";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useLocale, useTranslations, useTimeZone } from "#/i18n/use-i18n";

/**
 * Persistent banner while outbound delivery is paused.
 *
 * The queue keeps its rows untouched during a pause, so the banner doubles as
 * the way back: resuming here is the same server-side toggle as in Settings,
 * including the confirmation that warns about resumed urgent paging.
 */
export function DeliveriesPausedNotice() {
  const t = useTranslations();
  const locale = useLocale();
  const timeZone = useTimeZone() ?? fallbackTimeZone;
  const { data: settings } = useSuspenseQuery(appSettingsQueryOptions());
  const [resumeOpen, setResumeOpen] = useState(false);

  if (!settings.deliveryPaused) {
    return null;
  }

  return (
    <Alert>
      <AlertTitle>{t("deliveries.paused.title")}</AlertTitle>
      <AlertDescription>
        {settings.deliveryPausedAt
          ? t("deliveries.paused.description", {
              time: formatDateTime(settings.deliveryPausedAt, { locale, timeZone }),
            })
          : t("deliveries.paused.descriptionNoTime")}
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="sm" onClick={() => setResumeOpen(true)}>
          <RiPlayLine data-icon="inline-start" aria-hidden />
          {t("deliveries.paused.resume")}
        </Button>
      </AlertAction>
      <DeliveryResumeDialog
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        rawPayloadRetentionDays={settings.rawPayloadRetentionDays}
      />
    </Alert>
  );
}
