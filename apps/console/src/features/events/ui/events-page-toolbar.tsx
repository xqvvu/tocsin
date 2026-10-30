import { RiArrowLeftRightLine, RiFilterOffLine, RiRefreshLine } from "@remixicon/react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { useTranslations } from "#/i18n/use-i18n";

export function EventsPageToolbar({
  pending,
  onRefresh,
  onResetFilters,
  onViewDeliveries,
}: {
  pending: boolean;
  onRefresh: () => void;
  onResetFilters: () => void;
  /**
   * Opens the deliveries list with the filters both lists share. `null` hides
   * the action when there is nothing shared to carry.
   */
  onViewDeliveries?: (() => void) | null;
}) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("events.page.title")}
      description={t("events.page.description")}
      actions={
        <>
          {onViewDeliveries ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onViewDeliveries}
              title={t("events.page.viewMatchingDeliveriesTitle")}
            >
              <RiArrowLeftRightLine data-icon="inline-start" aria-hidden />
              {t("events.page.viewMatchingDeliveries")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onRefresh}
            title={t("events.page.refreshTitle")}
          >
            <RiRefreshLine data-icon="inline-start" aria-hidden />
            {t("common.actions.refresh")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onResetFilters}
            // The visible label is shared with the chip row and the empty
            // state, so name this one by its page-level scope.
            aria-label={t("events.page.resetTitle")}
            title={t("events.page.resetTitle")}
          >
            <RiFilterOffLine data-icon="inline-start" aria-hidden />
            {t("common.actions.resetFilters")}
          </Button>
        </>
      }
    />
  );
}
