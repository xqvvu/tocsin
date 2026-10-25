import { RiShieldCheckLine } from "@remixicon/react";
import { toast } from "sonner";

import { IconTooltip } from "#/components/common/icon-tooltip";
import { Button } from "#/components/ui/button";
import { sourceWebhookUrlFromPath } from "#/features/sources/model/source-webhook";
import { useTranslations } from "#/i18n/use-i18n";
import { copyText } from "#/lib/browser";

export interface SourceTokenNotice {
  sourceName: string;
  webhookPath: string;
  token: string;
}

export function SourceTokenNoticePanel({
  notice,
  onDismiss,
}: {
  notice: SourceTokenNotice;
  onDismiss: () => void;
}) {
  const t = useTranslations();
  const webhookUrl = sourceWebhookUrlFromPath(notice.webhookPath);
  const copyTokenLabel = t("sources.notice.copyToken");
  const copyUrlLabel = t("sources.notice.copyUrl");

  async function copy(value: string): Promise<void> {
    try {
      await copyText(value);
      toast.success(t("common.actions.copied"));
    } catch {
      toast.error(t("common.actions.copyFailed"), {
        description: t("common.actions.copyFailedDescription"),
      });
    }
  }

  return (
    <section className="border-l-primary bg-muted/50 border-l-4 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <RiShieldCheckLine className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("sources.notice.createdTitle")}</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("sources.notice.createdDescription", { sourceName: notice.sourceName })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconTooltip label={copyTokenLabel}>
            <Button
              type="button"
              size="sm"
              aria-label={copyTokenLabel}
              onClick={() => void copy(notice.token)}
            >
              {copyTokenLabel}
            </Button>
          </IconTooltip>
          <IconTooltip label={copyUrlLabel}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={copyUrlLabel}
              onClick={() => void copy(webhookUrl)}
            >
              {copyUrlLabel}
            </Button>
          </IconTooltip>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <span className="text-muted-foreground text-[11px]">{t("sources.notice.tokenLabel")}</span>
        <code className="bg-background block rounded border px-2 py-1 font-mono text-[11px] break-all select-all">
          {notice.token}
        </code>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-[11px]">
            {t("sources.notice.tokenOnceHint")}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            {t("sources.notice.dismissSaved")}
          </Button>
        </div>
      </div>
    </section>
  );
}
