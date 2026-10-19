import { RiFilterOffLine, RiInboxArchiveLine } from "@remixicon/react";

import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { useTranslations } from "#/i18n/use-i18n";

export function DeliveriesEmptyState({
  hasActiveFilters,
  onResetFilters,
}: {
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}) {
  const t = useTranslations();

  return (
    <Empty className="border-none p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RiInboxArchiveLine aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          {hasActiveFilters ? t("deliveries.table.emptyFiltered") : t("deliveries.table.empty")}
        </EmptyTitle>
        <EmptyDescription>
          {hasActiveFilters
            ? t("deliveries.table.emptyFilteredDescription")
            : t("deliveries.table.order")}
        </EmptyDescription>
      </EmptyHeader>
      {hasActiveFilters ? (
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>
            <RiFilterOffLine data-icon="inline-start" aria-hidden />
            {t("common.actions.resetFilters")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
