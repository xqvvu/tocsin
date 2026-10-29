import { RiFileWarningLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { recentParseFailuresQueryOptions } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Always-visible evidence that a provider parser rejected webhook payloads.
 *
 * A rejected payload is recorded as an event but produces no route match and no
 * delivery, so the delivery failure badge stays silent for exactly the failure
 * an upstream format change causes: the webhook starts answering 400 and the
 * alerts quietly stop arriving. The indicator stays silent while the query
 * loads or fails, matching the pause, delivery, and suppression indicators.
 */
export function ParseFailureIndicator() {
  const t = useTranslations();
  const failuresQuery = useQuery({ ...recentParseFailuresQueryOptions(), retry: false });
  const failedCount = failuresQuery.data?.events.total ?? 0;

  if (failedCount === 0) {
    return null;
  }

  const label = t("events.parseFailure.indicator.label", { count: failedCount });

  return (
    <Badge
      variant="destructive"
      render={
        <Link to="/events" search={{ parseFailed: "true", range: "24h" }} aria-label={label} />
      }
      title={t("events.parseFailure.indicator.title", { count: failedCount })}
      className="mr-1"
    >
      <RiFileWarningLine aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Badge>
  );
}
