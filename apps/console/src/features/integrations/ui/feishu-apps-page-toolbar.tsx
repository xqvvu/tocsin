import type { ReactNode } from "react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Mirrors the other list pages' toolbars: `PageToolbar` with a page title,
 * description, and actions. The shell no longer renders the page name, so every
 * list page owns its `<h1>` here.
 */
export function FeishuAppsPageToolbar({ actions }: { actions: ReactNode }) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("integrations.page.title")}
      description={t("integrations.page.description")}
      actions={actions}
    />
  );
}
