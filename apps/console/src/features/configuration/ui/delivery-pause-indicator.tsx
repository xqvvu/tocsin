import { RiPauseCircleLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { appSettingsQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Always-visible evidence that outbound delivery is paused.
 *
 * The pause is an instance-wide emergency stop: leaving it on silently stops
 * every route, so it has to be visible from any console page rather than only
 * Settings and the Deliveries banner. The indicator stays silent while the
 * query loads or fails: a transient fetch error must not read as a pause.
 */
export function DeliveryPauseIndicator() {
  const t = useTranslations();
  const settingsQuery = useQuery({ ...appSettingsQueryOptions(), retry: false });

  if (!settingsQuery.data?.deliveryPaused) {
    return null;
  }

  const label = t("deliveries.paused.title");

  return (
    <Badge
      variant="destructive"
      render={<Link to="/deliveries" aria-label={label} />}
      title={label}
      className="mr-1"
    >
      <RiPauseCircleLine aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Badge>
  );
}
