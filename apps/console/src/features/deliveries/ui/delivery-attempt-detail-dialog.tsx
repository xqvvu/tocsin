import { RiArrowRightUpLine, RiFileCopyLine } from "@remixicon/react";
import { toast } from "sonner";

import type { DeliveryAttempt } from "@tocsin/core";

import { CodeBlock } from "#/components/ai-elements/code-block";
import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { attemptDuration } from "#/features/deliveries/model/delivery-diagnostics";
import { DeliveryAttemptStateBadge } from "#/features/deliveries/ui/delivery-state-badge";
import { summarizeResponseBody } from "#/features/operations/model/operation-format";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";
import { copyText } from "#/lib/browser";

/**
 * Full error and response body for one delivery attempt.
 *
 * The attempts table compresses the note into one truncated line, so the only
 * way to read a long error or a structured response body without leaving the
 * console is this dialog. Both values come from the already-redacted detail DTO.
 */
export function DeliveryAttemptDetailDialog({ attempt }: { attempt: DeliveryAttempt }) {
  const t = useTranslations();
  const note = attempt.error ?? summarizeResponseBody(attempt.responseBody);
  const duration = attemptDuration(attempt);
  const response = formatResponseBody(attempt.responseBody);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={t("deliveries.detail.attemptDialog.open", {
              number: attempt.attemptNumber,
            })}
            className="flex w-full min-w-0 cursor-pointer items-center gap-1 text-left hover:underline"
          />
        }
      >
        <span className="min-w-0 flex-1 truncate">{note}</span>
        <RiArrowRightUpLine className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      </DialogTrigger>

      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>
            {t("deliveries.detail.attemptDialog.title", { number: attempt.attemptNumber })}
          </DialogTitle>
          <DialogDescription>{t("deliveries.detail.attemptDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">{t("deliveries.detail.attemptHeaders.state")}</dt>
            <dd>
              <DeliveryAttemptStateBadge state={attempt.state} />
            </dd>
            <dt className="text-muted-foreground">{t("deliveries.detail.attemptHeaders.http")}</dt>
            <dd>{attempt.responseStatus ?? "-"}</dd>
            <dt className="text-muted-foreground">
              {t("deliveries.detail.attemptHeaders.started")}
            </dt>
            <dd>
              <OperationTimestamp format="dateTime" value={attempt.startedAt} />
            </dd>
            <dt className="text-muted-foreground">
              {t("deliveries.detail.attemptHeaders.finished")}
            </dt>
            <dd>
              {attempt.finishedAt ? (
                <OperationTimestamp format="dateTime" value={attempt.finishedAt} />
              ) : (
                "-"
              )}
            </dd>
            <dt className="text-muted-foreground">
              {t("deliveries.detail.attemptHeaders.duration")}
            </dt>
            <dd>{duration ?? "-"}</dd>
          </dl>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-muted-foreground text-[11px] font-medium">
                {t("deliveries.detail.attemptDialog.error")}
              </h3>
              {attempt.error ? (
                <CopyButton
                  label={t("deliveries.detail.attemptDialog.copyError")}
                  value={attempt.error}
                />
              ) : null}
            </div>
            {attempt.error ? (
              <pre className="border-border bg-muted/30 max-h-60 overflow-auto border p-2 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap">
                {attempt.error}
              </pre>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t("deliveries.detail.attemptDialog.noError")}
              </p>
            )}
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-muted-foreground text-[11px] font-medium">
                {t("deliveries.detail.attemptDialog.responseBody")}
              </h3>
              {response ? (
                <CopyButton
                  label={t("deliveries.detail.attemptDialog.copyResponseBody")}
                  value={response.code}
                />
              ) : null}
            </div>
            {response ? (
              response.json ? (
                <CodeBlock
                  code={response.code}
                  language="json"
                  showLineNumbers
                  className="border-border max-h-96 overflow-auto border"
                />
              ) : (
                <pre className="border-border bg-muted/30 max-h-96 overflow-auto border p-2 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap">
                  {response.code}
                </pre>
              )
            ) : (
              <p className="text-muted-foreground text-xs">
                {t("deliveries.detail.attemptDialog.noResponseBody")}
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

function formatResponseBody(value: string | null): { code: string; json: boolean } | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return { code: JSON.stringify(JSON.parse(value), null, 2), json: true };
  } catch {
    return { code: value, json: false };
  }
}
