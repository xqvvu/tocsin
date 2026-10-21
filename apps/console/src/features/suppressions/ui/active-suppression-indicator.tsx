import { RiNotificationOffLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { suppressionsQueryOptions } from "#/features/suppressions/api/suppression.queries";
import { summarizeActiveSuppressions } from "#/features/suppressions/model/suppression-summary";
import { useTranslations } from "#/i18n/use-i18n";
import { OPERATIONAL_CLOCK_REFRESH_MS } from "#/i18n/use-operational-now";

/**
 * Always-visible evidence that a suppression is in force.
 *
 * The suppressions page is the only other place an active rule is visible, so
 * without this an operator on Events or Deliveries cannot tell "upstream is
 * quiet" from "a catch-all rule is swallowing everything". The indicator stays
 * silent while the query loads or fails: a dashboard-wide status strip must not
 * turn a transient fetch error into a second alarm.
 */
export function ActiveSuppressionIndicator() {
  const t = useTranslations();
  const suppressionsQuery = useQuery({ ...suppressionsQueryOptions(), retry: false });
  const now = useMountedNow();
  const summary = React.useMemo(
    () =>
      suppressionsQuery.data && now
        ? summarizeActiveSuppressions(suppressionsQuery.data, now)
        : null,
    [now, suppressionsQuery.data],
  );

  if (!summary || summary.activeCount === 0) {
    return null;
  }

  const catchAll = summary.catchAllCount > 0;
  const label = catchAll
    ? t("suppressions.indicator.catchAll")
    : t("suppressions.indicator.active", { count: summary.activeCount });

  return (
    <Badge
      variant={catchAll ? "destructive" : "outline"}
      render={<Link to="/suppressions" />}
      title={summary.names.join(" · ")}
      className="mr-1"
    >
      <RiNotificationOffLine aria-hidden />
      {label}
    </Badge>
  );
}

/**
 * Start counting only after mount.
 *
 * The server render has no suppression query data, so returning `null` until
 * the effect runs also keeps the hydration output identical on both sides.
 */
function useMountedNow(): string | null {
  const [now, setNow] = React.useState<string | null>(null);

  React.useEffect(() => {
    const update = () => setNow(new Date().toISOString());

    update();
    const timer = setInterval(update, OPERATIONAL_CLOCK_REFRESH_MS);

    return () => clearInterval(timer);
  }, []);

  return now;
}
