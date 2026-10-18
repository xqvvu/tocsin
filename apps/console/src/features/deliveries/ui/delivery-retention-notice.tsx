import { RiPauseCircleLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { buttonVariants } from "#/components/ui/button";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

/**
 * "Why is this still pending?" for a delivery the worker cannot claim.
 *
 * `claimNext` only picks up deliveries whose destination and route are both
 * enabled, while enqueue does not check either. A disabled target therefore
 * holds its pending deliveries silently until an operator re-enables it. The
 * detail DTO already carries both flags, so this is a read-only explanation
 * rather than a state change.
 */
export function DeliveryRetentionNotice({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const destinationDisabled = !detail.destination.enabled;
  const routeDisabled = detail.route !== null && !detail.route.enabled;

  if (detail.job.state !== "pending" || (!destinationDisabled && !routeDisabled)) {
    return null;
  }

  return (
    <Alert>
      <RiPauseCircleLine aria-hidden />
      <AlertTitle>{t("deliveries.retention.title")}</AlertTitle>
      <AlertDescription>
        <p>
          {destinationDisabled && routeDisabled
            ? t("deliveries.retention.bothDisabled")
            : destinationDisabled
              ? t("deliveries.retention.destinationDisabled")
              : t("deliveries.retention.routeDisabled")}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {destinationDisabled ? (
            <Link
              to="/destinations"
              className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0")}
            >
              {t("deliveries.retention.openDestination")}
            </Link>
          ) : null}
          {routeDisabled ? (
            <Link
              to="/routes"
              className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0")}
            >
              {t("deliveries.retention.openRoute")}
            </Link>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
