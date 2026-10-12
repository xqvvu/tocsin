import { RiRefreshLine } from "@remixicon/react";
import { useSuspenseQueries } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { useDestinationMutations } from "#/features/destinations/api/destination.mutations";
import {
  destinationCatalogQueryOptions,
  destinationsQueryOptions,
} from "#/features/destinations/api/destination.queries";
import type { DestinationPreviewNotice } from "#/features/destinations/model/destination-types";
import { DestinationAddDialog } from "#/features/destinations/ui/destination-add-dialog";
import { DestinationEditDialog } from "#/features/destinations/ui/destination-edit-dialog";
import {
  DestinationPreviewDialog,
  showDestinationTestToast,
} from "#/features/destinations/ui/destination-notices";
import type {
  PreviewDestinationFormInput,
  PreviewEditDestinationFormInput,
} from "#/features/destinations/ui/destination-ui-types";
import { DestinationsPageToolbar } from "#/features/destinations/ui/destinations-page-toolbar";
import { DestinationsSection } from "#/features/destinations/ui/destinations-section";
import { feishuAppsQueryOptions } from "#/features/integrations/api/feishu-app.queries";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

export function DestinationsPage() {
  const t = useTranslations();
  const [
    { data: destinations },
    { data: routes },
    { data: destinationCatalog },
    { data: feishuApps },
  ] = useSuspenseQueries({
    queries: [
      destinationsQueryOptions(),
      routesQueryOptions(),
      destinationCatalogQueryOptions(),
      feishuAppsQueryOptions(),
    ],
  });
  const {
    deleteDestination,
    invalidateDestinations,
    previewDestination,
    previewDestinationDraft,
    previewDestinationUpdate,
    testDestination,
    updateDestination,
  } = useDestinationMutations();
  const [destinationPreviewNotice, setDestinationPreviewNotice] =
    React.useState<DestinationPreviewNotice | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false);
  const [editingDestinationId, setEditingDestinationId] = React.useState<string | null>(null);
  const [destinationEditorOpen, setDestinationEditorOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const editingDestination = editingDestinationId
    ? (destinations.find((destination) => destination.id === editingDestinationId) ?? null)
    : null;
  const pending = pendingAction !== null;

  async function refreshConfiguration(): Promise<boolean> {
    try {
      await invalidateDestinations();
      return true;
    } catch (error) {
      toast.error(t("destinations.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function runAction<T>(
    action: string,
    fn: () => Promise<T>,
    options: { refresh?: boolean } = {},
  ): Promise<T | null> {
    setPendingAction(action);

    try {
      const result = await fn();

      if (options.refresh) {
        await refreshConfiguration();
      }

      return result;
    } catch (error) {
      toast.error(t("destinations.page.operationFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  async function submitAction<T>(action: string, fn: () => Promise<T>): Promise<T | null> {
    return runAction(action, fn, { refresh: true });
  }

  function previewDraft(input: PreviewDestinationFormInput) {
    return runAction("preview-destination-draft", async () => {
      const result = await previewDestinationDraft(input);
      setDestinationPreviewNotice(result);
      setPreviewDialogOpen(true);
      return result;
    });
  }

  function previewEdit(input: PreviewEditDestinationFormInput) {
    return runAction(`preview-destination-update-${input.id}`, async () => {
      const result = await previewDestinationUpdate({
        id: input.id,
        name: input.name,
        config: input.config,
        sampleStatus: input.sampleStatus,
      });
      setDestinationPreviewNotice(result);
      setPreviewDialogOpen(true);
      return result;
    });
  }

  return (
    <DashboardContentLayout
      main={
        <>
          <DestinationsPageToolbar
            actions={
              <>
                <DestinationAddDialog
                  destinationCatalog={destinationCatalog}
                  feishuApps={feishuApps}
                  disabled={pending}
                  onPreview={previewDraft}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => void refreshConfiguration()}
                  title={t("destinations.page.refreshTitle")}
                  className="w-fit"
                >
                  <RiRefreshLine data-icon="inline-start" aria-hidden />
                  {t("common.actions.refresh")}
                </Button>
              </>
            }
          />
          <DestinationPreviewDialog
            notice={destinationPreviewNotice}
            open={previewDialogOpen && destinationPreviewNotice !== null}
            onOpenChange={(open) => {
              setPreviewDialogOpen(open);
            }}
          />
          <DestinationsSection
            destinations={destinations}
            destinationCatalog={destinationCatalog}
            routes={routes}
            pending={pending}
            onTest={(destination) =>
              void runAction(`test-destination-${destination.id}`, async () => {
                const result = await testDestination({
                  id: destination.id,
                });
                showDestinationTestToast(result, t);
                return result;
              })
            }
            onPreview={(destination) =>
              void runAction(`preview-destination-${destination.id}`, async () => {
                const result = await previewDestination({
                  id: destination.id,
                });
                setDestinationPreviewNotice(result);
                setPreviewDialogOpen(true);
                return result;
              })
            }
            onEdit={(destinationId) => {
              setEditingDestinationId(destinationId);
              setDestinationEditorOpen(true);
            }}
            onToggle={(destination) =>
              void submitAction(`toggle-destination-${destination.id}`, () =>
                updateDestination({
                  id: destination.id,
                  enabled: !destination.enabled,
                }),
              )
            }
            onDelete={(destination) =>
              void submitAction(`delete-destination-${destination.id}`, () =>
                deleteDestination({
                  id: destination.id,
                }),
              )
            }
          />

          <DestinationEditDialog
            destinationCatalog={destinationCatalog}
            feishuApps={feishuApps}
            destination={editingDestination}
            open={destinationEditorOpen && editingDestination !== null}
            disabled={pending}
            onOpenChange={(open) => {
              setDestinationEditorOpen(open);
            }}
            onPreview={previewEdit}
          />
        </>
      }
    />
  );
}
