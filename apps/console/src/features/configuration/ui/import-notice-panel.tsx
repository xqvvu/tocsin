import { RiCheckboxCircleLine, RiKey2Line } from "@remixicon/react";

import type { ImportConfigurationResult } from "@tocsin/core";

import { CopyableCodeLine } from "#/components/common/copyable-code-line";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
  sourceWebhookPath,
  sourceWebhookUrlFromPath,
} from "#/features/sources/model/source-webhook";
import { useTranslations } from "#/i18n/use-i18n";

export function ImportNoticePanel({ notice }: { notice: ImportConfigurationResult }) {
  const t = useTranslations();

  return (
    <Alert>
      <RiCheckboxCircleLine aria-hidden />
      <AlertTitle>{t("configuration.importNotice.title")}</AlertTitle>
      <AlertDescription>
        {notice.generatedSourceTokens.length === 0
          ? t("configuration.importNotice.empty")
          : t("configuration.importNotice.generated")}
      </AlertDescription>
      {notice.generatedSourceTokens.length === 0 ? null : (
        <div className="col-start-2 mt-2 grid gap-2">
          {notice.generatedSourceTokens.map((source) => {
            const webhookPath = sourceWebhookPath(source.sourceId);

            return (
              <div key={source.sourceId} className="border-border grid gap-1 border p-2">
                <div className="flex items-center gap-2 font-medium">
                  <RiKey2Line className="size-3.5" aria-hidden />
                  {source.sourceName}
                </div>
                <div className="text-muted-foreground">
                  {t("configuration.importNotice.webhookUrl")}
                </div>
                <CopyableCodeLine
                  value={webhookPath}
                  copyValue={sourceWebhookUrlFromPath(webhookPath)}
                  copyLabel={t("configuration.importNotice.copyWebhookUrl")}
                />
                <div className="text-muted-foreground">
                  {t("configuration.importNotice.sourceToken")}
                </div>
                <CopyableCodeLine
                  value={source.token}
                  copyValue={source.token}
                  copyLabel={t("configuration.importNotice.copySourceToken")}
                  wrap
                />
              </div>
            );
          })}
        </div>
      )}
    </Alert>
  );
}
