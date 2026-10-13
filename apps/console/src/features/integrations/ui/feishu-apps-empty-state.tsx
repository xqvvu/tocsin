import { RiApps2Line } from "@remixicon/react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Matches the other list pages' empty states, which use the shared `Empty`
 * primitives rather than a hand-rolled two-line block. That is what makes the
 * whole table area read the same whether a list has rows or not.
 */
export function FeishuAppsEmptyState() {
  const t = useTranslations();

  return (
    <Empty className="border-none p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RiApps2Line aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t("integrations.table.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("integrations.table.empty.description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{t("integrations.table.empty.content")}</EmptyContent>
    </Empty>
  );
}
