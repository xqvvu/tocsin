import { Link } from "@tanstack/react-router";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { DeliveryRetryButton } from "#/features/deliveries/ui/delivery-retry-button";
import { DeliveryStateBadge } from "#/features/deliveries/ui/delivery-state-badge";
import { sortDeliveriesByOperationalPriority } from "#/features/events/model/delivery-priority";
import { EventDetailDeliveryReceiptCell } from "#/features/events/ui/event-detail-delivery-receipt-cell";
import { EventDetailDeliverySuppressionCell } from "#/features/events/ui/event-detail-delivery-suppression-cell";
import { EventDetailSectionHeader } from "#/features/events/ui/event-detail-section-header";
import type { EventDetailData } from "#/features/events/ui/event-detail-types";
import { RetryTimestamp } from "#/features/operations/ui/retry-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

export function EventDetailDeliveriesTable({
  deliveries,
}: {
  deliveries: EventDetailData["deliveries"];
}) {
  const t = useTranslations();
  const orderedDeliveries = sortDeliveriesByOperationalPriority(deliveries);

  return (
    <section className="flex h-full min-h-0 flex-col gap-2">
      <EventDetailSectionHeader
        title={t("events.detail.eventDeliveriesTitle")}
        meta={t("events.detail.summary.deliveries", { count: deliveries.length })}
      />
      <div className="border-border bg-background min-h-0 flex-1 overflow-auto border">
        <Table className="min-w-230 table-fixed">
          <TableHeader className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[13%]">
                {t("events.detail.deliveryHeaders.destination")}
              </TableHead>
              <TableHead className="w-[10%]">{t("events.detail.deliveryHeaders.route")}</TableHead>
              <TableHead className="w-[10%]">{t("events.detail.deliveryHeaders.state")}</TableHead>
              <TableHead className="w-[5%]">
                {t("events.detail.deliveryHeaders.attempts")}
              </TableHead>
              <TableHead className="w-[14%]">
                {t("events.detail.deliveryHeaders.receipt")}
              </TableHead>
              <TableHead className="w-[12%]">{t("events.detail.deliveryHeaders.next")}</TableHead>
              <TableHead className="w-[14%]">
                {t("events.detail.deliveryHeaders.lastError")}
              </TableHead>
              <TableHead className="w-[11%]">
                {t("events.detail.deliveryHeaders.suppression")}
              </TableHead>
              <TableHead className="w-[11%]">
                {t("events.detail.deliveryHeaders.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={9}>
                  {t("events.detail.empty.deliveries")}
                </TableCell>
              </TableRow>
            ) : (
              orderedDeliveries.map((delivery) => (
                <TableRow key={delivery.id} className="align-top">
                  <TableCell className="truncate font-medium" title={delivery.destinationName}>
                    {/* The row already carries retry; opening the delivery is
                        the other half of the on-call lookup, so the target name
                        itself is the link. */}
                    <Link
                      to="/deliveries/$deliveryId"
                      params={{ deliveryId: delivery.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {delivery.destinationName}
                    </Link>
                  </TableCell>
                  <TableCell className="truncate" title={delivery.routeName ?? undefined}>
                    {delivery.routeName ?? t("events.detail.manual")}
                  </TableCell>
                  <TableCell>
                    <DeliveryStateBadge state={delivery.state} />
                  </TableCell>
                  <TableCell>
                    {delivery.attemptCount}/{delivery.maxAttempts}
                  </TableCell>
                  <TableCell>
                    <EventDetailDeliveryReceiptCell delivery={delivery} />
                  </TableCell>
                  <TableCell className="truncate">
                    {delivery.nextAttemptAt ? (
                      <RetryTimestamp value={delivery.nextAttemptAt} />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell title={delivery.lastError ?? undefined}>
                    {delivery.lastError ? (
                      <span className="line-clamp-2">{delivery.lastError}</span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <EventDetailDeliverySuppressionCell delivery={delivery} />
                  </TableCell>
                  <TableCell>
                    <DeliveryRetryButton
                      id={delivery.id}
                      state={delivery.state}
                      lastError={delivery.lastError}
                      destinationName={delivery.destinationName}
                      attemptCount={delivery.attemptCount}
                      maxAttempts={delivery.maxAttempts}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
