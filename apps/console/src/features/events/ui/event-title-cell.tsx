import { Badge } from "#/components/ui/badge";
import { SeverityBadge } from "#/features/events/ui/severity-badge";
import type { Operations } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

export function EventTitleCell({
  title,
  fingerprint,
  severity,
  parseFailed,
}: {
  title: string;
  fingerprint: string;
  severity: Operations["events"]["items"][number]["severity"];
  parseFailed: boolean;
}) {
  const t = useTranslations();
  /*
    Intake writes a fixed English title into the audit row, but the viewer's
    locale is a display concern that intake cannot know. Rendering the stored
    literal would put English text next to the localized badge in a zh-Hans
    console; the stored value stays visible in the normalized and raw tabs.
  */
  const displayTitle = parseFailed ? t("events.parseFailure.fallbackTitle") : title;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-w-0 items-center gap-1.5">
        <SeverityBadge severity={severity} />
        {/*
          A parser-rejected payload arrives with `unknown` severity and a
          generic title, so the raw row looks like a provider-authored alert.
          The badge is the only cue in the list that this is Tocsin's audit row
          and that the raw payload is worth opening.
        */}
        {parseFailed ? (
          <Badge
            variant="destructive"
            className="shrink-0"
            title={t("events.table.parseFailedTitle")}
          >
            {t("events.table.parseFailed")}
          </Badge>
        ) : null}
        <span className="truncate font-medium" title={displayTitle}>
          {displayTitle}
        </span>
      </div>
      <div className="text-muted-foreground truncate text-[11px]" title={fingerprint}>
        {fingerprint}
      </div>
    </div>
  );
}
