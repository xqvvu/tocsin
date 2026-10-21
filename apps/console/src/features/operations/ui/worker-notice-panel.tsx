import type { ReactNode } from "react";
import { toast } from "sonner";

import type { WorkerRunNotice } from "#/features/operations/model/operation-types";
import { useTranslations } from "#/i18n/use-i18n";

type TranslationFn = ReturnType<typeof useTranslations>;

export function showWorkerRunToast(notice: WorkerRunNotice, t: TranslationFn) {
  const details: ReactNode[] = [
    t("operations.workerNotice.description", {
      claimed: notice.claimed,
      reclaimed: notice.reclaimed,
      succeeded: notice.succeeded,
      failed: notice.failed,
      retrying: notice.retrying,
    }),
  ];

  if (notice.paused) {
    details.push(
      <span className="text-destructive" key="paused">
        {t("operations.workerNotice.paused")}
      </span>,
    );
  }

  if (notice.health) {
    details.push(
      <span className="text-muted-foreground" key="health">
        {t("operations.workerNotice.health", {
          state: notice.health.state,
          lastFinishedAt: notice.health.lastFinishedAt ?? t("common.placeholder.empty"),
        })}
      </span>,
    );
  }

  if (notice.runnerHealth?.lastError) {
    details.push(
      <span className="text-destructive" key="last-error">
        {t("operations.workerNotice.lastError", {
          error: notice.runnerHealth.lastError,
        })}
      </span>,
    );
  }

  toast.info(t("operations.workerNotice.title"), {
    description: <span className="flex flex-col gap-1">{details}</span>,
  });
}
