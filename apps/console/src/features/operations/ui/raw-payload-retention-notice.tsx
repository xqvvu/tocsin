import { useQuery } from "@tanstack/react-query";

import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";
import { useOperationalNow } from "#/i18n/use-operational-now";
import { rawPayloadRetentionWindow } from "#/lib/raw-payload-retention";

/**
 * When this event's raw payload retention window closes.
 *
 * The raw/payload tabs otherwise only tell an operator that a payload *is*
 * pruned, which is after the evidence export window already closed. The
 * window itself is `receivedAt + rawPayloadRetentionDays`, but pruning is
 * lazy — it rides the ingest path — so an expired row can still be readable
 * and the copy has to distinguish "still retained" from "expired, not yet
 * swept".
 */
export function RawPayloadRetentionNotice({ receivedAt }: { receivedAt: string }) {
  const t = useTranslations();
  const now = useOperationalNow();
  // Non-blocking on purpose: the payload is why the tab exists, so a settings
  // read that is still in flight (or failing) hides the hint instead of
  // suspending the tab. `retry: false` keeps a dashboard-wide settings outage
  // from retrying on every raw tab open.
  const settingsQuery = useQuery({ ...appSettingsQueryOptions(), retry: false });
  const window = rawPayloadRetentionWindow({
    receivedAt,
    retentionDays: settingsQuery.data?.rawPayloadRetentionDays,
    now,
  });

  if (window === null) {
    return null;
  }

  if (window.expired) {
    return (
      <div role="note" className="text-muted-foreground text-xs">
        {t("common.rawPayloadRetention.expired", { days: window.retentionDays })}
      </div>
    );
  }

  return (
    <div
      role="note"
      className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs"
    >
      <span>{t("common.rawPayloadRetention.retainedUntil")}</span>
      <OperationTimestamp className="text-foreground" format="dateTime" value={window.expiresAt} />
      <span>
        · {t("common.rawPayloadRetention.retentionPolicy", { days: window.retentionDays })}
      </span>
    </div>
  );
}
