import { Badge } from "#/components/ui/badge";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { SuppressionFromEventDialog } from "#/features/suppressions/ui/suppression-from-event-dialog";
import { useTranslations } from "#/i18n/use-i18n";

export function EventLabelList({ detail }: { detail: EventDetailData }) {
  const t = useTranslations();
  const entries = Object.entries(detail.event.normalized.labels);

  return (
    <div className="border-border border-t p-3">
      <div className="text-muted-foreground mb-2 text-[11px]">
        {t("events.detail.terms.labels")}
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("events.detail.empty.labels")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {entries.map(([key, value]) => (
            <span key={key} className="inline-flex max-w-full items-center gap-0.5">
              <Badge
                variant="outline"
                className="max-w-full justify-start font-mono text-[11px]"
                title={`${key}=${value}`}
              >
                <span className="text-muted-foreground">{key}=</span>
                <span className="truncate">{value}</span>
              </Badge>
              {/*
                A label is a recurring dimension ("env=prod"), so silencing the
                value the operator is looking at is the useful action here —
                silencing the whole fingerprint is the toolbar's job.
              */}
              <SuppressionFromEventDialog
                event={detail.event}
                source={detail.source}
                label={{ key, value }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
