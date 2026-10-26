import { RiRefreshLine } from "@remixicon/react";
import { useSuspenseQueries } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { destinationsQueryOptions } from "#/features/destinations/api/destination.queries";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { useSourceMutations } from "#/features/sources/api/source.mutations";
import { sourcesQueryOptions } from "#/features/sources/api/source.queries";
import { sourceWebhookPath } from "#/features/sources/model/source-webhook";
import { SourcesAddDialog } from "#/features/sources/ui/source-add-dialog";
import { SourcesEditDialog } from "#/features/sources/ui/source-edit-dialog";
import {
  SourceTokenNoticePanel,
  type SourceTokenNotice,
} from "#/features/sources/ui/source-token-notice-panel";
import { SourcesPageToolbar } from "#/features/sources/ui/sources-page-toolbar";
import { SourcesSection } from "#/features/sources/ui/sources-section";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function SourcesPage() {
  const t = useTranslations();
  const [{ data: sources }, { data: routes }, { data: destinations }] = useSuspenseQueries({
    queries: [sourcesQueryOptions(), routesQueryOptions(), destinationsQueryOptions()],
  });
  const { deleteSource, invalidateSources, previewDeleteSource, rotateSourceToken, updateSource } =
    useSourceMutations();
  const requestDeleteImpact = React.useCallback(
    (id: string) => previewDeleteSource({ id }),
    [previewDeleteSource],
  );
  const [tokenNotice, setTokenNotice] = React.useState<SourceTokenNotice | null>(null);
  const [editingSourceId, setEditingSourceId] = React.useState<string | null>(null);
  const [sourceEditorOpen, setSourceEditorOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const editingSource = editingSourceId
    ? (sources.find((source) => source.id === editingSourceId) ?? null)
    : null;
  const pending = pendingAction !== null;

  async function refreshConfiguration(): Promise<boolean> {
    try {
      await invalidateSources();
      return true;
    } catch (error) {
      toast.error(t("sources.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function submitAction<T>(action: string, fn: () => Promise<T>): Promise<T | null> {
    setPendingAction(action);

    try {
      const result = await fn();
      await refreshConfiguration();
      return result;
    } catch (error) {
      toast.error(t("sources.page.operationFailed"), {
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
          <SourcesPageToolbar
            actions={
              <>
                <SourcesAddDialog disabled={pending} onCreated={setTokenNotice} />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => void refreshConfiguration()}
                  title={t("sources.page.refreshTitle")}
                  className="w-fit"
                >
                  <RiRefreshLine data-icon="inline-start" aria-hidden />
                  {t("common.actions.refresh")}
                </Button>
              </>
            }
          />

          {tokenNotice ? (
            <SourceTokenNoticePanel notice={tokenNotice} onDismiss={() => setTokenNotice(null)} />
          ) : null}

          <SourcesSection
            sources={sources}
            routes={routes}
            destinations={destinations}
            pending={pending}
            requestDeleteImpact={requestDeleteImpact}
            onEdit={(sourceId) => {
              setEditingSourceId(sourceId);
              setSourceEditorOpen(true);
            }}
            onToggle={(source) =>
              void submitAction(`toggle-source-${source.id}`, () =>
                updateSource({
                  id: source.id,
                  enabled: !source.enabled,
                }),
              )
            }
            onRotateToken={(source) =>
              void submitAction(`rotate-source-${source.id}`, async () => {
                const result = await rotateSourceToken({
                  id: source.id,
                });
                setTokenNotice({
                  sourceName: result.source.name,
                  webhookPath: sourceWebhookPath(result.source.id),
                  token: result.token,
                });
                return result;
              })
            }
            onDelete={(source) =>
              void submitAction(`delete-source-${source.id}`, () =>
                deleteSource({
                  id: source.id,
                }),
              )
            }
          />

          <SourcesEditDialog
            source={editingSource}
            open={sourceEditorOpen && editingSource !== null}
            disabled={pending}
            onOpenChange={(open) => {
              setSourceEditorOpen(open);
            }}
          />
        </>
      }
    />
  );
}
