import type { SourceRehearsalVerdict } from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * What the real delivery chain would do with the rehearsed event.
 *
 * `suppressed` is an intentional "we chose not to send", so it must never read
 * as a failure: like the delivery state badge, it stays outlined and muted
 * instead of red.
 */
export function SourceRehearsalVerdictBadge({ verdict }: { verdict: SourceRehearsalVerdict }) {
  const t = useTranslations();

  return (
    <Badge variant={verdictBadgeVariant(verdict)} className={verdictBadgeClassName(verdict)}>
      {t(`sources.rehearsal.verdict.${verdict}`)}
    </Badge>
  );
}

function verdictBadgeVariant(verdict: SourceRehearsalVerdict): "default" | "secondary" | "outline" {
  if (verdict === "deliver") {
    return "default";
  }

  return verdict === "queued_paused" ? "secondary" : "outline";
}

function verdictBadgeClassName(verdict: SourceRehearsalVerdict): string | undefined {
  return verdict === "suppressed" || verdict === "destination_disabled"
    ? "border-muted-foreground/40 text-muted-foreground"
    : undefined;
}
