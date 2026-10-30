import { RiArrowLeftRightLine, RiFilterOffLine, RiPlayLine } from "@remixicon/react";
import * as React from "react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveriesPageToolbar({
  pending,
  paused,
  onRunWorker,
  onResetFilters,
  onViewEvents,
}: {
  pending: boolean;
  paused: boolean;
  onRunWorker: () => void;
  onResetFilters: () => void;
  /**
   * Opens the events list with the filters both lists share. `null` hides the
   * action when there is nothing shared to carry.
   */
  onViewEvents?: (() => void) | null;
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
            {onViewEvents ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onViewEvents}
                title={t("deliveries.page.viewMatchingEventsTitle")}
              >
                <RiArrowLeftRightLine data-icon="inline-start" aria-hidden />
                {t("deliveries.page.viewMatchingEvents")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={onResetFilters}
              // The visible label is shared with the chip row and the empty
              // state, so name this one by its page-level scope.
              aria-label={t("deliveries.page.resetTitle")}
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
