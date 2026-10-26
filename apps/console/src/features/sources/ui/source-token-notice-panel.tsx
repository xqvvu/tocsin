import { RiShieldCheckLine } from "@remixicon/react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
    <Alert role="status" aria-live="polite" className="border-l-primary bg-muted/50 border-l-4">
      <RiShieldCheckLine aria-hidden />
      <AlertTitle>{t("sources.notice.createdTitle")}</AlertTitle>
      <AlertDescription>
        {t("sources.notice.createdDescription", { sourceName: notice.sourceName })}
      </AlertDescription>

      <div className="col-start-2 mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => void copy(notice.token)}>
            {copyTokenLabel}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy(webhookUrl)}>
            {copyUrlLabel}
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">
            {t("sources.notice.tokenLabel")}
          </span>
          <code className="bg-background block rounded border px-2 py-1 font-mono text-[11px] break-all select-all">
            {notice.token}
          </code>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            {t("sources.notice.dismissSaved")}
          </Button>
        </div>
      </div>
    </Alert>
  );
}
