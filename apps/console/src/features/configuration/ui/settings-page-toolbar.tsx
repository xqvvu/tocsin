import { RiRefreshLine } from "@remixicon/react";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useTranslations } from "#/i18n/use-i18n";

export function SettingsPageToolbar({
  pending,
  onRefresh,
}: {
  pending: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations();

  return (
    <PageToolbar
      title={t("configuration.settings.title")}
      tabs={
        <TabsList
          variant="line"
          aria-label={t("configuration.settings.tabsLabel")}
          className="h-9 min-w-0 gap-6 p-0"
        >
          <TabsTrigger value="ui" className="px-0 text-sm">
            {t("configuration.settings.uiTab")}
          </TabsTrigger>
          <TabsTrigger value="toml" className="px-0 text-sm">
            {t("configuration.settings.tomlTab")}
          </TabsTrigger>
          <TabsTrigger value="json" className="px-0 text-sm">
            {t("configuration.settings.jsonTab")}
          </TabsTrigger>
        </TabsList>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onRefresh}
          title={t("configuration.settings.refreshTitle")}
          className="shrink-0"
        >
          <RiRefreshLine data-icon="inline-start" aria-hidden />
          {t("common.actions.refresh")}
        </Button>
      }
    />
  );
}
