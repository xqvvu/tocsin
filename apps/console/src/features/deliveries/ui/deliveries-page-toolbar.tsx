import { RiFilterOffLine, RiPlayLine } from "@remixicon/react";
import * as React from "react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveriesPageToolbar({
  pending,
  paused,
  onRunWorker,
  onResetFilters,
}: {
  pending: boolean;
  paused: boolean;
  onRunWorker: () => void;
  onResetFilters: () => void;
}) {
  const t = useTranslations();
  // A native `title` never reaches touch users and is announced unreliably, so
  // the paused reason is also rendered as text and wired to the button.
  const pausedReasonId = React.useId();

  return (
    <PageToolbar
      title={t("deliveries.page.title")}
      description={t("deliveries.page.description")}
      actions={
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onResetFilters}
              title={t("deliveries.page.resetTitle")}
            >
              <RiFilterOffLine data-icon="inline-start" aria-hidden />
              {t("common.actions.resetFilters")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={pending || paused}
              onClick={onRunWorker}
              aria-describedby={paused ? pausedReasonId : undefined}
              title={
                paused
                  ? t("deliveries.page.runWorkerPausedTitle")
                  : t("deliveries.page.runWorkerTitle")
              }
            >
              <RiPlayLine data-icon="inline-start" aria-hidden />
              {t("common.actions.runWorker")}
            </Button>
          </div>
          {paused ? (
            <p id={pausedReasonId} className="text-muted-foreground text-[11px]">
              {t("deliveries.page.runWorkerPausedHint")}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
