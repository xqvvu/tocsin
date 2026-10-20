import { RiArrowLeftLine, RiErrorWarningLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { buttonVariants } from "#/components/ui/button";
import { DeliveryDestinationEditAction } from "#/features/deliveries/ui/delivery-destination-edit-action";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryDetailView } from "#/features/deliveries/ui/delivery-detail-view";
import { DeliveryRetryButton } from "#/features/deliveries/ui/delivery-retry-button";
import { deliveryDetailQueryOptions } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function DeliveryDetailPage({ deliveryId }: { deliveryId: string }) {
  const t = useTranslations();
  const { data: detail } = useSuspenseQuery(deliveryDetailQueryOptions(deliveryId));

  return (
    <DashboardContentLayout
      main={
        <>
          <DeliveryDetailPageToolbar deliveryId={deliveryId} detail={detail} />
          {detail ? (
            <section className="min-h-0 flex-1 overflow-hidden">
              <DeliveryDetailView detail={detail} />
            </section>
          ) : (
            <Alert variant="destructive">
              <RiErrorWarningLine aria-hidden />
              <AlertTitle>{t("deliveries.detail.notFoundTitle")}</AlertTitle>
              <AlertDescription>{t("deliveries.detail.notFoundDescription")}</AlertDescription>
            </Alert>
          )}
        </>
      }
    />
  );
}

function DeliveryDetailPageToolbar({
  deliveryId,
  detail,
}: {
  deliveryId: string;
  detail: DeliveryDetailData | null;
}) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("deliveries.detail.title")}
      description={t("deliveries.detail.description")}
      badge={deliveryId}
      actions={
        <>
          {detail ? (
            <DeliveryDestinationEditAction
              deliveryId={detail.job.id}
              destinationId={detail.destination.id}
              state={detail.job.state}
            />
          ) : null}
          {detail ? <DeliveryRetryButton id={detail.job.id} state={detail.job.state} /> : null}
          <Link
            to="/deliveries"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
          >
            <RiArrowLeftLine data-icon="inline-start" aria-hidden />
            {t("deliveries.detail.back")}
          </Link>
        </>
      }
    />
  );
}
