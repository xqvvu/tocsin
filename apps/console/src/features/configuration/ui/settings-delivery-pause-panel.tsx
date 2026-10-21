import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Checkbox } from "#/components/ui/checkbox";
import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useAppSettingsMutation } from "#/features/configuration/api/use-app-settings-mutation";
import { formatDateTime } from "#/features/operations/model/operation-format";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useLocale, useTranslations, useTimeZone } from "#/i18n/use-i18n";

/**
 * Emergency stop for outbound delivery.
 *
 * Deliberately not part of the preferences form: the toggle must take effect
 * immediately (the form only applies on save and then reloads the page), and an
 * operator reaching for this during an incident should not have to remember to
 * press save.
 */
export function SettingsDeliveryPausePanel() {
  const t = useTranslations();
  const locale = useLocale();
  const timeZone = useTimeZone() ?? fallbackTimeZone;
  const { data: settings } = useSuspenseQuery(appSettingsQueryOptions());
  const mutation = useAppSettingsMutation();

  async function setPaused(paused: boolean) {
    try {
      await mutation.mutateAsync({
        rawPayloadRetentionDays: settings.rawPayloadRetentionDays,
        deliveryPaused: paused,
      });
    } catch (error) {
      toast.error(t("configuration.deliveryPause.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section className="border-border flex flex-col gap-1 border px-3 py-2.5">
      <label className="flex items-start gap-2 text-xs font-medium">
        <Checkbox
          name="delivery-paused"
          checked={settings.deliveryPaused}
          disabled={mutation.isPending}
          className="mt-0.5"
          onCheckedChange={(checked: boolean) => void setPaused(checked)}
        />
        <span className="min-w-0">
          <span className="block">{t("configuration.deliveryPause.toggleLabel")}</span>
          <span className="text-muted-foreground block text-[11px] font-normal">
            {t("configuration.deliveryPause.toggleDescription")}
          </span>
        </span>
      </label>
      {settings.deliveryPaused ? (
        <p className="text-destructive text-[11px] font-medium">
          {settings.deliveryPausedAt
            ? t("configuration.deliveryPause.pausedAt", {
                time: formatDateTime(settings.deliveryPausedAt, { locale, timeZone }),
              })
            : t("configuration.deliveryPause.paused")}
        </p>
      ) : null}
    </section>
  );
}
