import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { EventJsonBlock } from "#/features/events/ui/event-json-block";
import { EventRawPrunedNotice } from "#/features/events/ui/event-raw-pruned-notice";
import { useTranslations } from "#/i18n/use-i18n";

export function EventRawTab({ detail }: { detail: EventDetailData }) {
  const t = useTranslations();

  if (detail.rawPayloadPruned) {
    return <EventRawPrunedNotice />;
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <p className="border-border bg-background text-muted-foreground border px-3 py-2 text-xs">
        {t("events.detail.rawNotice")}
      </p>
      <div className="grid min-h-0 gap-3 lg:grid-cols-2">
        <EventJsonBlock
          title={t("events.detail.json.rawPayload")}
          value={detail.event.rawPayload}
        />
        <EventJsonBlock
          title={t("events.detail.json.rawHeaders")}
          value={detail.event.rawHeaders}
        />
      </div>
    </div>
  );
}
