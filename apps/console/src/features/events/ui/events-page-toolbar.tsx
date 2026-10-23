import { RiFilterOffLine, RiRefreshLine } from "@remixicon/react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { useTranslations } from "#/i18n/use-i18n";

export function EventsPageToolbar({
  pending,
  onRefresh,
  onResetFilters,
}: {
  pending: boolean;
  onRefresh: () => void;
  onResetFilters: () => void;
}) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("events.page.title")}
      description={t("events.page.description")}
      actions={
        <>
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
