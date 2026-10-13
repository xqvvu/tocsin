import type { ReactNode } from "react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Mirrors the other list pages' toolbars: `PageToolbar` with only a
 * description and actions.
 *
 * Deliberately no `title`. The dashboard shell already renders the page heading
 * from the navigation item; passing one here adds a second `<h1>` on this page
 * alone, which is why the header looked different from every other list.
 */
export function FeishuAppsPageToolbar({ actions }: { actions: ReactNode }) {
  const t = useTranslations();

  return <PageToolbar description={t("integrations.page.description")} actions={actions} />;
}
