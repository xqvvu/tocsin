import type { FeishuAppListItem } from "@tocsin/core";

import { SimpleTable } from "#/components/common/simple-table";
import { FeishuAppActions } from "#/features/integrations/ui/feishu-app-actions";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { useTranslations } from "#/i18n/use-i18n";

export function FeishuAppsSection({
  apps,
  pending,
  onTest,
  onEdit,
  onDelete,
}: {
  apps: FeishuAppListItem[];
  pending: boolean;
  onTest: (app: FeishuAppListItem) => void;
  onEdit: (app: FeishuAppListItem) => void;
  onDelete: (app: FeishuAppListItem) => void;
}) {
  const t = useTranslations();

  return (
    <SimpleTable
      variant="flush"
      headers={[
        t("integrations.table.headers.name"),
        t("integrations.table.headers.appId"),
        t("integrations.table.headers.referenced"),
        t("integrations.table.headers.updatedAt"),
        t("integrations.table.headers.actions"),
      ]}
      columnClassNames={["w-1/4", "w-1/5", "w-1/4", "w-1/5", "w-24"]}
      rows={apps.map((app) => ({
        key: app.id,
        cells: [
          <span key="name" className="truncate text-sm font-medium">
            {app.name}
          </span>,
          <span key="app-id" className="text-muted-foreground truncate font-mono text-xs">
            {app.appId}
          </span>,
          <span key="referenced" className="text-muted-foreground truncate text-xs">
            {app.referencedDestinations.length === 0
              ? t("integrations.table.referenced.none")
              : app.referencedDestinations.map((reference) => reference.destinationName).join("、")}
          </span>,
          <OperationTimestamp key="updated" format="dateTime" value={app.updatedAt} />,
          <FeishuAppActions
            key="actions"
            app={app}
            pending={pending}
            onTest={onTest}
            onEdit={onEdit}
            onDelete={onDelete}
          />,
        ],
      }))}
      empty={
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm">{t("integrations.table.empty.title")}</span>
          <span className="text-xs">{t("integrations.table.empty.description")}</span>
        </div>
      }
    />
  );
}
