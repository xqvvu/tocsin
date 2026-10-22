import { RiErrorWarningLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { failedDeliveriesQueryOptions } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Always-visible evidence that deliveries failed recently.
 *
 * Deliveries is the only page that lists a failed job, so an operator reading
 * Events or Routes cannot tell "nothing is happening" from "alerts were dropped
 * on the way out". The indicator stays silent while the query loads or fails:
 * a dashboard-wide status strip must not turn a transient fetch error into a
 * second alarm, matching the pause and suppression indicators.
 */
export function DeliveryFailureIndicator() {
  const t = useTranslations();
  const failuresQuery = useQuery({ ...failedDeliveriesQueryOptions(), retry: false });
  const failedCount = failuresQuery.data?.deliveries.total ?? 0;

  if (failedCount === 0) {
    return null;
  }

  const label = t("deliveries.failureIndicator.label", { count: failedCount });

  return (
    <Badge
      variant="destructive"
      render={
        <Link
          to="/deliveries"
          search={{ deliveryState: "failed", range: "24h" }}
          aria-label={label}
        />
      }
      title={t("deliveries.failureIndicator.title", { count: failedCount })}
      className="mr-1"
    >
      <RiErrorWarningLine aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Badge>
  );
}
