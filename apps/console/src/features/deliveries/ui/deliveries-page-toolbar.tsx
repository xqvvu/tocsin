import { RiFilterOffLine, RiPlayLine } from "@remixicon/react";

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

  return (
    <PageToolbar
      description={t("deliveries.page.description")}
      actions={
        <>
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
            title={
              paused
                ? t("deliveries.page.runWorkerPausedTitle")
                : t("deliveries.page.runWorkerTitle")
            }
          >
            <RiPlayLine data-icon="inline-start" aria-hidden />
            {t("common.actions.runWorker")}
          </Button>
        </>
      }
    />
  );
}
