import { RiPlayLine } from "@remixicon/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { DeliveryResumeDialog } from "#/features/configuration/ui/delivery-resume-dialog";
import { deliveryBacklogQueryOptions } from "#/features/operations/api/operations.queries";
import {
  formatDateTime,
  formatDurationBetween,
} from "#/features/operations/model/operation-format";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useLocale, useTranslations, useTimeZone } from "#/i18n/use-i18n";
import { OPERATIONAL_CLOCK_REFRESH_MS, useOperationalNow } from "#/i18n/use-operational-now";

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
  const { data: backlog } = useQuery({
    ...deliveryBacklogQueryOptions(),
    enabled: settings.deliveryPaused,
    // The queue grows while paused; keep the count honest without a refresh.
    refetchInterval: settings.deliveryPaused ? OPERATIONAL_CLOCK_REFRESH_MS : false,
  });
  const now = useOperationalNow();
  const [resumeOpen, setResumeOpen] = useState(false);

  if (!settings.deliveryPaused) {
    return null;
  }

  // `oldestCreatedAt` is null exactly when nothing is claimable; a client clock
  // behind the server can also make the duration unusable, so the count-only
  // sentence is the fallback instead of rendering an empty placeholder.
  const wait =
    backlog?.oldestCreatedAt != null
      ? formatDurationBetween(backlog.oldestCreatedAt, now.toISOString())
      : null;
  const backlogText = !backlog
    ? null
    : backlog.claimable === 0
      ? t("deliveries.paused.backlogEmpty")
      : wait
        ? t("deliveries.paused.backlog", { count: backlog.claimable, wait })
        : t("deliveries.paused.backlogNoWait", { count: backlog.claimable });

  return (
    <Alert>
      <AlertTitle>{t("deliveries.paused.title")}</AlertTitle>
      <AlertDescription>
        <p>
          {settings.deliveryPausedAt
            ? t("deliveries.paused.description", {
                time: formatDateTime(settings.deliveryPausedAt, { locale, timeZone }),
              })
            : t("deliveries.paused.descriptionNoTime")}
        </p>
        {backlogText ? <p>{backlogText}</p> : null}
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
