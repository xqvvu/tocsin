import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { useDestinationMutations } from "#/features/destinations/api/destination.mutations";
import {
  destinationCatalogQueryOptions,
  destinationsQueryOptions,
} from "#/features/destinations/api/destination.queries";
import type { DestinationPreviewNotice } from "#/features/destinations/model/destination-types";
import { DestinationEditDialog } from "#/features/destinations/ui/destination-edit-dialog";
import { DestinationPreviewDialog } from "#/features/destinations/ui/destination-notices";
import type { PreviewEditDestinationFormInput } from "#/features/destinations/ui/destination-ui-types";
import { feishuAppsQueryOptions } from "#/features/integrations/api/feishu-app.queries";
import { recentEventsQueryOptions } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Opens the destination editor from a surface that only knows the destination
 * id, such as a failed delivery detail.
 *
 * The destinations page already has the list, catalog, and Feishu app rows in
 * its route loader; a delivery detail does not. Resolving them lazily when the
 * dialog opens keeps that page from paying for configuration data it may never
 * need, while still reusing the exact editor and preview the destinations page
 * shows.
 */
export function DestinationEditDialogLoader({
  destinationId,
  open,
  onOpenChange,
  onSaved,
}: {
  destinationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the edit dialog persists a save; used to refresh the caller. */
  onSaved?: () => void | Promise<void>;
}) {
  const t = useTranslations();
  const [previewNotice, setPreviewNotice] = React.useState<DestinationPreviewNotice | null>(null);
  const [previewInput, setPreviewInput] = React.useState<PreviewEditDestinationFormInput | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewPending, setPreviewPending] = React.useState(false);
  const destinationsQuery = useQuery({
    ...destinationsQueryOptions(),
    enabled: open,
  });
  const catalogQuery = useQuery({
    ...destinationCatalogQueryOptions(),
    enabled: open,
  });
  const feishuAppsQuery = useQuery({
    ...feishuAppsQueryOptions(),
    enabled: open,
  });
  const recentEventsQuery = useQuery({
    ...recentEventsQueryOptions(),
    enabled: previewOpen,
  });
  const { previewDestinationUpdate } = useDestinationMutations();
  const destination =
    destinationsQuery.data?.find((candidate) => candidate.id === destinationId) ?? null;
  const loadError = destinationsQuery.error ?? catalogQuery.error ?? feishuAppsQuery.error;
  const loading =
    open &&
    !loadError &&
    (destinationsQuery.isPending || catalogQuery.isPending || feishuAppsQuery.isPending);

  function runPreview(input: PreviewEditDestinationFormInput, sampleEventId: string | null) {
    setPreviewPending(true);

    return previewDestinationUpdate({
      ...input,
      ...(sampleEventId ? { sampleEventId } : {}),
    })
      .then((result) => {
        setPreviewInput(input);
        setPreviewNotice(result);
        setPreviewOpen(true);
        return result;
      })
      .catch((error: unknown) => {
        toast.error(t("destinations.page.operationFailed"), {
          description: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
      .finally(() => {
        setPreviewPending(false);
      });
  }

  return (
    <>
      <DestinationEditDialog
        destinationCatalog={catalogQuery.data ?? []}
        feishuApps={feishuAppsQuery.data ?? []}
        destination={destination}
        open={open}
        loading={loading}
        loadError={loadError ? describeError(loadError) : null}
        onOpenChange={onOpenChange}
        onRetryLoad={() => {
          void destinationsQuery.refetch();
          void catalogQuery.refetch();
          void feishuAppsQuery.refetch();
        }}
        onSaved={onSaved}
        onPreview={(input) => runPreview(input, null)}
      />
      <DestinationPreviewDialog
        notice={previewNotice}
        open={previewOpen && previewNotice !== null}
        onOpenChange={setPreviewOpen}
        sampleEvents={recentEventsQuery.data?.events.items ?? []}
        sampleEventsPending={recentEventsQuery.isPending}
        sampleEventsError={recentEventsQuery.isError}
        sampleChangeDisabled={previewPending}
        onSampleChange={(sampleEventId) => {
          if (previewInput) {
            void runPreview(previewInput, sampleEventId);
          }
        }}
      />
    </>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
