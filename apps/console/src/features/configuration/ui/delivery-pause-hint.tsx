import { useQuery } from "@tanstack/react-query";

import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Explains how the global delivery pause affects the action that owns this
 * dialog. Replay and retry only enqueue through the worker, while a destination
 * test calls the adapter directly and sends immediately even while paused.
 */
export function DeliveryPauseHint({ mode }: { mode: "queued" | "immediate" }) {
  const t = useTranslations();
  const { data: settings } = useQuery(appSettingsQueryOptions());

  if (!settings?.deliveryPaused) {
    return null;
  }

  return (
    <p
      role="note"
      className={
        mode === "immediate"
          ? "text-destructive text-xs leading-relaxed font-medium"
          : "text-muted-foreground text-xs leading-relaxed"
      }
    >
      {t(mode === "immediate" ? "deliveries.pauseHint.immediate" : "deliveries.pauseHint.queued")}
    </p>
  );
}
