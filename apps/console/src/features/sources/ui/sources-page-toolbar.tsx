import type { ReactNode } from "react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { useTranslations } from "#/i18n/use-i18n";

export function SourcesPageToolbar({ actions }: { actions: ReactNode }) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("sources.page.title")}
      description={t("sources.page.description")}
      actions={actions}
    />
  );
}
