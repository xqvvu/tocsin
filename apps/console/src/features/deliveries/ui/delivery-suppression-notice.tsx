import { RiNotificationOffLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { buttonVariants } from "#/components/ui/button";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliverySuppressionChecks } from "#/features/deliveries/ui/delivery-suppression-checks";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

/**
 * "Why was this not sent?" for a suppressed delivery (PRD §2.5 / story 22).
 *
 * The reason is the snapshot stored on the delivery itself, so it stays readable
 * after the rule is deleted or pruned; `suppressionId` is the only field that
 * can go missing, and the copy says so instead of implying the delivery failed.
 */
export function DeliverySuppressionNotice({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const suppressedAt = detail.job.suppressedAt;

  return (
    <Alert>
      <RiNotificationOffLine aria-hidden />
      <AlertTitle>{t("deliveries.suppression.title")}</AlertTitle>
      <AlertDescription>
        <dl className="grid gap-1">
          <div>
            <dt className="inline text-[11px] font-medium">
              {t("deliveries.suppression.reason")}:{" "}
            </dt>
            <dd className="inline">
              {detail.job.suppressReason ?? t("deliveries.suppression.unknownReason")}
            </dd>
          </div>
          {suppressedAt ? (
            <div>
              <dt className="inline text-[11px] font-medium">
                {t("deliveries.suppression.suppressedAt")}:{" "}
              </dt>
              <dd className="inline">
                <OperationTimestamp format="dateTime" value={suppressedAt} />
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="inline text-[11px] font-medium">{t("deliveries.suppression.rule")}: </dt>
            <dd className="inline">
              {detail.job.suppressionId ? (
                <Link
                  to="/suppressions/$suppressionId"
                  params={{ suppressionId: detail.job.suppressionId }}
                  className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0")}
                >
                  {detail.job.suppressionId}
                </Link>
              ) : (
                t("deliveries.suppression.ruleGone")
              )}
            </dd>
          </div>
        </dl>
        {detail.job.suppressionId ? <DeliverySuppressionChecks detail={detail} /> : null}
      </AlertDescription>
    </Alert>
  );
}
