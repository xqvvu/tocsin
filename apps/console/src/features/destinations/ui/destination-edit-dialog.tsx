import { RiRefreshLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import type { FeishuAppListItem } from "@tocsin/core";

import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { useDestinationMutations } from "#/features/destinations/api/destination.mutations";
import { destinationTemplateDraftQueryOptions } from "#/features/destinations/api/destination.queries";
import type {
  DestinationCatalog,
  DestinationListItem,
  DestinationSubmitHandler,
  PreviewEditDestinationFormInput,
} from "#/features/destinations/ui/destination-ui-types";
import { EditDestinationForm } from "#/features/destinations/ui/edit-destination-form";
import { useTranslations } from "#/i18n/use-i18n";

export function DestinationEditDialog({
  destinationCatalog,
  feishuApps,
  destination,
  open,
  disabled = false,
  onOpenChange,
  onPreview,
}: {
  destinationCatalog: DestinationCatalog;
  feishuApps: FeishuAppListItem[];
  destination: DestinationListItem | null;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview: DestinationSubmitHandler<PreviewEditDestinationFormInput>;
}) {
  const t = useTranslations();
  const [pending, setPending] = React.useState(false);
  const { invalidateDestinations, updateDestination } = useDestinationMutations();
  const templateDraftQuery = useQuery({
    ...destinationTemplateDraftQueryOptions(destination?.id ?? ""),
    enabled: open && destination !== null,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t("destinations.form.edit.title")}</DialogTitle>
          <DialogDescription>{t("destinations.form.edit.description")}</DialogDescription>
        </DialogHeader>

        {destination && templateDraftQuery.data ? (
          <EditDestinationForm
            destinationCatalog={destinationCatalog}
            feishuApps={feishuApps}
            key={destination.id}
            showHeader={false}
            framed={false}
            layout="dialog"
            destination={destination}
            editorDraft={templateDraftQuery.data}
            pending={disabled || pending}
            onCancel={() => onOpenChange(false)}
            onPreview={onPreview}
            onSubmit={async (input) => {
              setPending(true);
              try {
                await updateDestination(input);
                await invalidateDestinations();
                onOpenChange(false);
              } catch (error) {
                toast.error(t("destinations.page.operationFailed"), {
                  description: error instanceof Error ? error.message : String(error),
                });
                return false;
              } finally {
                setPending(false);
              }
            }}
          />
        ) : destination && templateDraftQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("destinations.form.templateDraftLoadError")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>
                {templateDraftQuery.error instanceof Error
                  ? templateDraftQuery.error.message
                  : String(templateDraftQuery.error)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void templateDraftQuery.refetch()}
              >
                <RiRefreshLine data-icon="inline-start" aria-hidden />
                {t("common.actions.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : destination ? (
          <EditDestinationForm.Skeleton />
        ) : null}
      </ConfigurationDialogContent>
    </Dialog>
  );
}
