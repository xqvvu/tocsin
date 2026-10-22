import type { ReactNode } from "react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { useTranslations } from "#/i18n/use-i18n";

export function DestinationsPageToolbar({ actions }: { actions: ReactNode }) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("destinations.page.title")}
      description={t("destinations.page.description")}
      actions={actions}
    />
  );
}
