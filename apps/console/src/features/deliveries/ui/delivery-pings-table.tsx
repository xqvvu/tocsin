import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { DeliveryDetailSectionHeader } from "#/features/deliveries/ui/delivery-detail-section-header";
import type { DeliveryDetailData } from "#/features/deliveries/ui/delivery-detail-types";
import { DeliveryPingDetailDialog } from "#/features/deliveries/ui/delivery-ping-detail-dialog";
import { DeliveryPingStateBadge } from "#/features/deliveries/ui/delivery-state-badge";
import { DeliveryUrgentPingExplanation } from "#/features/deliveries/ui/delivery-urgent-ping-explanation";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { RetryTimestamp } from "#/features/operations/ui/retry-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveryPingsTable({ detail }: { detail: DeliveryDetailData }) {
  const t = useTranslations();
  const pings = detail.pings;

  return (
    <section className="flex h-full min-h-0 flex-col gap-2">
      <DeliveryDetailSectionHeader
        title={t("deliveries.detail.pingsTitle")}
        meta={t("deliveries.detail.summary.pings", { count: pings.length })}
      />
      {pings.length === 0 ? (
        <DeliveryUrgentPingExplanation detail={detail} />
      ) : (
        <div className="border-border bg-background min-h-0 flex-1 overflow-auto border">
          <Table className="min-w-240 table-fixed">
            <TableHeader className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[18%]">
                  {t("deliveries.detail.pingHeaders.receiver")}
                </TableHead>
                <TableHead className="w-[10%]">
                  {t("deliveries.detail.pingHeaders.state")}
                </TableHead>
                <TableHead className="w-[14%]">
                  {t("deliveries.detail.pingHeaders.trigger")}
                </TableHead>
                <TableHead className="w-[7%]">
                  {t("deliveries.detail.pingHeaders.attempts")}
                </TableHead>
                <TableHead className="w-[15%]">
                  {t("deliveries.detail.pingHeaders.created")}
                </TableHead>
                <TableHead className="w-[11%]">
                  {t("deliveries.detail.pingHeaders.fired")}
                </TableHead>
                <TableHead className="w-[11%]">
                  {t("deliveries.detail.pingHeaders.nextRetry")}
                </TableHead>
                <TableHead>{t("deliveries.detail.pingHeaders.error")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pings.map((ping) => (
                <TableRow key={ping.id}>
                  <TableCell className="truncate font-mono text-xs" title={ping.receiver}>
                    {ping.receiver}
                  </TableCell>
                  <TableCell>
                    <DeliveryPingStateBadge state={ping.state} />
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="text-muted-foreground">
                      {t(`deliveries.pingTrigger.${ping.trigger}`)}
                    </div>
                    {ping.initiatedBy ? (
                      <div className="truncate font-mono" title={ping.initiatedBy}>
                        {t("deliveries.detail.pingInitiatedBy", { user: ping.initiatedBy })}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ping.attemptCount}/{ping.maxAttempts}
                  </TableCell>
                  <TableCell>
                    <OperationTimestamp format="dateTime" value={ping.createdAt} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {ping.firedAt ? (
                      <OperationTimestamp
                        format="time"
                        titleFormat="dateTime"
                        value={ping.firedAt}
                      />
                    ) : (
                      <span className="text-muted-foreground">{t("common.placeholder.empty")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ping.nextAttemptAt ? (
                      <RetryTimestamp value={ping.nextAttemptAt} />
                    ) : (
                      <span className="text-muted-foreground">{t("common.placeholder.empty")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate text-xs">
                    {ping.lastError ? (
                      <DeliveryPingDetailDialog ping={ping} />
                    ) : (
                      t("common.placeholder.empty")
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
