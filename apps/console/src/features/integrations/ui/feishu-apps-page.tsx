import { RiAddLine, RiRefreshLine } from "@remixicon/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { FeishuAppListItem } from "@tocsin/core";

import { PageToolbar } from "#/components/common/page-toolbar";
import { Button } from "#/components/ui/button";
import { useFeishuAppMutations } from "#/features/integrations/api/feishu-app.mutations";
import { feishuAppsQueryOptions } from "#/features/integrations/api/feishu-app.queries";
import { FeishuAppDialog } from "#/features/integrations/ui/feishu-app-dialog";
import { FeishuAppsSection } from "#/features/integrations/ui/feishu-apps-section";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function FeishuAppsPage() {
  const t = useTranslations();
  const { data: apps } = useSuspenseQuery(feishuAppsQueryOptions());
  const { deleteFeishuApp, invalidateFeishuApps, testFeishuApp } = useFeishuAppMutations();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingApp, setEditingApp] = React.useState<FeishuAppListItem | null>(null);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const pending = pendingAction !== null;

  async function runAction<T>(action: string, fn: () => Promise<T>): Promise<T | null> {
    setPendingAction(action);

    try {
      return await fn();
    } catch (error) {
      toast.error(t("integrations.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <DashboardContentLayout
      main={
        <>
          <PageToolbar
            title={t("integrations.page.title")}
            description={t("integrations.page.description")}
            actions={
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  className="w-fit"
                  title={t("integrations.page.addTitle")}
                  onClick={() => {
                    setEditingApp(null);
                    setDialogOpen(true);
                  }}
                >
                  <RiAddLine data-icon="inline-start" aria-hidden />
                  {t("common.actions.add")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  className="w-fit"
                  title={t("integrations.page.refreshTitle")}
                  onClick={() =>
                    void runAction("refresh-feishu-apps", () => invalidateFeishuApps())
                  }
                >
                  <RiRefreshLine data-icon="inline-start" aria-hidden />
                  {t("common.actions.refresh")}
                </Button>
              </>
            }
          />

          <FeishuAppsSection
            apps={apps}
            pending={pending}
            onTest={(app) =>
              void runAction(`test-feishu-app-${app.id}`, async () => {
                const result = await testFeishuApp({ id: app.id });

                if (result.success) {
                  toast.success(t("integrations.test.successTitle", { appName: result.appName }));
                } else {
                  toast.error(t("integrations.test.failureTitle", { appName: result.appName }), {
                    description: result.errorMessage ?? undefined,
                  });
                }

                return result;
              })
            }
            onEdit={(app) => {
              setEditingApp(app);
              setDialogOpen(true);
            }}
            onDelete={(app) =>
              void runAction(`delete-feishu-app-${app.id}`, async () => {
                await deleteFeishuApp({ id: app.id });
                await invalidateFeishuApps();
              })
            }
          />

          <FeishuAppDialog
            key={editingApp?.id ?? "create"}
            app={editingApp}
            open={dialogOpen}
            disabled={pending}
            onOpenChange={(open) => {
              setDialogOpen(open);

              if (!open) {
                setEditingApp(null);
              }
            }}
          />
        </>
      }
    />
  );
}
