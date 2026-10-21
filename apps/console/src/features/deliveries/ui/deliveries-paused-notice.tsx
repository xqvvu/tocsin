import { RiPlayLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useAppSettingsMutation } from "#/features/configuration/api/use-app-settings-mutation";
import { formatDateTime } from "#/features/operations/model/operation-format";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useLocale, useTranslations, useTimeZone } from "#/i18n/use-i18n";

/**
 * Persistent banner while outbound delivery is paused.
 *
 * The queue keeps its rows untouched during a pause, so the banner doubles as
 * the way back: resuming here is the same server-side toggle as in Settings.
 */
export function DeliveriesPausedNotice() {
  const t = useTranslations();
  const locale = useLocale();
  const timeZone = useTimeZone() ?? fallbackTimeZone;
  const { data: settings } = useSuspenseQuery(appSettingsQueryOptions());
  const mutation = useAppSettingsMutation();

  if (!settings.deliveryPaused) {
    return null;
  }

  async function resume() {
    try {
      await mutation.mutateAsync({
        rawPayloadRetentionDays: settings.rawPayloadRetentionDays,
        deliveryPaused: false,
      });
      toast.success(t("deliveries.paused.resumed"));
    } catch (error) {
      toast.error(t("deliveries.paused.resumeFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => void resume()}
        >
          <RiPlayLine data-icon="inline-start" aria-hidden />
          {t("deliveries.paused.resume")}
        </Button>
      </AlertAction>
    </Alert>
  );
}
