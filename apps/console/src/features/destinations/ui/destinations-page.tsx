import { RiRefreshLine } from "@remixicon/react";
import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
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
import { DestinationTestDialog } from "#/features/destinations/ui/destination-test-dialog";
import type {
  DestinationListItem,
  PreviewDestinationFormInput,
  PreviewEditDestinationFormInput,
} from "#/features/destinations/ui/destination-ui-types";
import { DestinationsPageToolbar } from "#/features/destinations/ui/destinations-page-toolbar";
import { DestinationsSection } from "#/features/destinations/ui/destinations-section";
import { feishuAppsQueryOptions } from "#/features/integrations/api/feishu-app.queries";
import { recentEventsQueryOptions } from "#/features/operations/api/operations.queries";
import { routesQueryOptions } from "#/features/routes/api/route.queries";
import { useTranslations } from "#/i18n/use-i18n";
import { DashboardContentLayout } from "#/shell/dashboard-layout";

/**
 * What produced the preview currently on screen. The dialog re-runs the same
 * preview when the operator swaps in a historical Event sample, so the
 * destination identity and the drafted config have to be remembered.
 */
type PreviewRequest =
  | { source: "destination"; id: string }
  | { source: "draft"; input: PreviewDestinationFormInput }
  | { source: "update"; input: PreviewEditDestinationFormInput };

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
  const [previewRequest, setPreviewRequest] = React.useState<PreviewRequest | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false);
  const [testDestinationTarget, setTestDestinationTarget] =
    React.useState<DestinationListItem | null>(null);
  const [testDialogOpen, setTestDialogOpen] = React.useState(false);
  const recentEventsQuery = useQuery({
    ...recentEventsQueryOptions(),
    enabled: previewDialogOpen || testDialogOpen,
  });
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

  /**
   * Run one preview with an explicit sample. `null` selects the built-in
   * sample; an event id renders the stored Event through the destination, which
   * is what makes the preview trustworthy for adapter-specific payloads.
   */
  function runPreview(request: PreviewRequest, sampleEventId: string | null) {
    const sampleArgs = sampleEventId ? { sampleEventId } : {};

    return runAction(`preview-destination-${request.source}`, async () => {
      const result =
        request.source === "destination"
          ? await previewDestination({ id: request.id, ...sampleArgs })
          : request.source === "draft"
            ? await previewDestinationDraft({ ...request.input, ...sampleArgs })
            : await previewDestinationUpdate({
                id: request.input.id,
                name: request.input.name,
                config: request.input.config,
                sampleStatus: request.input.sampleStatus,
                ...sampleArgs,
              });

      setPreviewRequest(request);
      setDestinationPreviewNotice(result);
      setPreviewDialogOpen(true);
      return result;
    });
  }

  function previewDraft(input: PreviewDestinationFormInput) {
    return runPreview({ source: "draft", input }, null);
  }

  /**
   * Send one test through the saved destination. `null` keeps the built-in
   * sample; an Event id renders the stored Event so the operator sees the same
   * fields and message shape a real alert would produce.
   */
  function sendTest(sampleEventId: string | null) {
    if (!testDestinationTarget) {
      return Promise.resolve(null);
    }

    return runAction(`test-destination-${testDestinationTarget.id}`, async () => {
      const result = await testDestination({
        id: testDestinationTarget.id,
        ...(sampleEventId ? { sampleEventId } : {}),
      });
      showDestinationTestToast(result, t);
      return result;
    });
  }

  function previewEdit(input: PreviewEditDestinationFormInput) {
    return runPreview({ source: "update", input }, null);
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
            sampleEvents={recentEventsQuery.data?.events.items ?? []}
            sampleEventsPending={recentEventsQuery.isPending}
            sampleEventsError={recentEventsQuery.isError}
            sampleChangeDisabled={pending}
            onSampleChange={(sampleEventId) => {
              if (previewRequest) {
                void runPreview(previewRequest, sampleEventId);
              }
            }}
          />
          <DestinationTestDialog
            key={testDestinationTarget?.id ?? "no-test-destination"}
            destinationName={testDestinationTarget?.name ?? ""}
            open={testDialogOpen && testDestinationTarget !== null}
            onOpenChange={(open) => {
              setTestDialogOpen(open);

              if (!open) {
                setTestDestinationTarget(null);
              }
            }}
            sampleEvents={recentEventsQuery.data?.events.items ?? []}
            sampleEventsPending={recentEventsQuery.isPending}
            sampleEventsError={recentEventsQuery.isError}
            onSend={sendTest}
          />
          <DestinationsSection
            destinations={destinations}
            destinationCatalog={destinationCatalog}
            routes={routes}
            pending={pending}
            onTest={(destination) => {
              setTestDestinationTarget(destination);
              setTestDialogOpen(true);
            }}
            onPreview={(destination) =>
              void runPreview({ source: "destination", id: destination.id }, null)
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
