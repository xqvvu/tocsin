import { RiArrowRightUpLine, RiFileCopyLine } from "@remixicon/react";
import { toast } from "sonner";

import type { OncallPing } from "@tocsin/core";

import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { DeliveryPingStateBadge } from "#/features/deliveries/ui/delivery-state-badge";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";
import { copyText } from "#/lib/browser";

/**
 * Full error and call timeline for one urgent ping.
 *
 * The pings table gives each ping a single line, so a long provider error is
 * unreadable there. This dialog is the only place an operator can read and copy
 * the whole redacted error without leaving the console. Values come from the
 * already-redacted delivery detail DTO.
 */
export function DeliveryPingDetailDialog({ ping }: { ping: OncallPing }) {
  const t = useTranslations();
  const error = ping.lastError ?? "";

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={t("deliveries.detail.pingDialog.open", { receiver: ping.receiver })}
            className="flex w-full min-w-0 cursor-pointer items-center gap-1 text-left hover:underline"
          />
        }
      >
        <span className="min-w-0 flex-1 truncate">{error}</span>
        <RiArrowRightUpLine className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      </DialogTrigger>

      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t("deliveries.detail.pingDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("deliveries.detail.pingDialog.description", { receiver: ping.receiver })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">{t("deliveries.detail.pingHeaders.receiver")}</dt>
            <dd className="font-mono break-all">{ping.receiver}</dd>
            <dt className="text-muted-foreground">{t("deliveries.detail.pingHeaders.state")}</dt>
            <dd>
              <DeliveryPingStateBadge state={ping.state} />
            </dd>
            <dt className="text-muted-foreground">{t("deliveries.detail.pingHeaders.trigger")}</dt>
            <dd>
              {t(`deliveries.pingTrigger.${ping.trigger}`)}
              {ping.initiatedBy ? (
                <span className="text-muted-foreground ml-2 font-mono">
                  {t("deliveries.detail.pingInitiatedBy", { user: ping.initiatedBy })}
                </span>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">{t("deliveries.detail.pingHeaders.attempts")}</dt>
            <dd>
              {ping.attemptCount}/{ping.maxAttempts}
            </dd>
            <dt className="text-muted-foreground">{t("deliveries.detail.pingHeaders.created")}</dt>
            <dd>
              <OperationTimestamp format="dateTime" value={ping.createdAt} />
            </dd>
            <dt className="text-muted-foreground">{t("deliveries.detail.pingHeaders.fired")}</dt>
            <dd>
              {ping.firedAt ? <OperationTimestamp format="dateTime" value={ping.firedAt} /> : "-"}
            </dd>
            <dt className="text-muted-foreground">
              {t("deliveries.detail.pingHeaders.nextRetry")}
            </dt>
            <dd>
              {ping.nextAttemptAt ? (
                <OperationTimestamp format="dateTime" value={ping.nextAttemptAt} />
              ) : (
                "-"
              )}
            </dd>
          </dl>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-muted-foreground text-[11px] font-medium">
                {t("deliveries.detail.pingDialog.error")}
              </h3>
              {error ? (
                <CopyButton label={t("deliveries.detail.pingDialog.copyError")} value={error} />
              ) : null}
            </div>
            {error ? (
              <pre className="border-border bg-muted/30 max-h-60 overflow-auto border p-2 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap">
                {error}
              </pre>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t("deliveries.detail.pingDialog.noError")}
              </p>
            )}
          </section>
        </div>
      </ConfigurationDialogContent>
    </Dialog>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-6 shrink-0 px-2 text-[11px]"
      onClick={async () => {
        try {
          await copyText(value);
          toast.success(t("common.actions.copied"));
        } catch {
          toast.error(t("common.actions.copyFailed"));
        }
      }}
    >
      <RiFileCopyLine data-icon="inline-start" aria-hidden />
      {label}
    </Button>
  );
}
