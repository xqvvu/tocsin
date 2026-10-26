import { DESTINATION_HEALTH_RECENT_FAILURE_HOURS } from "@tocsin/core";
import type { DestinationDeliveryHealth } from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import { useOperationDateFormatter } from "#/features/operations/model/operation-format";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Last delivery outcomes for one destination.
 *
 * Answers "is this target still delivering?" from the list itself: latest
 * success/failure, the queued backlog, and the recent failure count. The
 * aggregate is computed server-side; this cell only formats it.
 */
export function DestinationDeliveryHealthCell({
  health,
}: {
  health: DestinationDeliveryHealth | undefined;
}) {
  const t = useTranslations();
  const dates = useOperationDateFormatter();

  if (health === undefined) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const hasAnyData =
    health.lastSucceededAt !== null ||
    health.lastFailedAt !== null ||
    health.queuedCount > 0 ||
    health.recentFailureCount > 0;

  return (
    <div className="grid gap-1 text-xs">
      {health.lastSucceededAt === null ? null : (
        <span className="whitespace-nowrap">
          {t("destinations.health.lastSucceeded", {
            time: dates.formatDateTimeCompact(health.lastSucceededAt),
          })}
        </span>
      )}
      {health.lastFailedAt === null ? null : (
        <span className="text-destructive whitespace-nowrap">
          {t("destinations.health.lastFailed", {
            time: dates.formatDateTimeCompact(health.lastFailedAt),
          })}
        </span>
      )}
      {hasAnyData ? null : (
        <span className="text-muted-foreground">{t("destinations.health.none")}</span>
      )}
      {health.queuedCount === 0 && health.recentFailureCount === 0 ? null : (
        <span className="flex flex-wrap gap-1">
          {health.queuedCount === 0 ? null : (
            <Badge variant="secondary">
              {t("destinations.health.queued", { count: health.queuedCount })}
            </Badge>
          )}
          {health.recentFailureCount === 0 ? null : (
            <Badge variant="destructive">
              {t("destinations.health.recentFailures", {
                count: health.recentFailureCount,
                hours: DESTINATION_HEALTH_RECENT_FAILURE_HOURS,
              })}
            </Badge>
          )}
        </span>
      )}
    </div>
  );
}
