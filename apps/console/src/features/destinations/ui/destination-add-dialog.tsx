import { RiAddLine } from "@remixicon/react";
import * as React from "react";
import { toast } from "sonner";

import type { FeishuAppListItem } from "@tocsin/core";

import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { useDestinationMutations } from "#/features/destinations/api/destination.mutations";
import { CreateDestinationForm } from "#/features/destinations/ui/create-destination-form";
import type {
  DestinationCatalog,
  DestinationSubmitHandler,
  PreviewDestinationFormInput,
} from "#/features/destinations/ui/destination-ui-types";
import { useTranslations } from "#/i18n/use-i18n";

export function DestinationAddDialog({
  destinationCatalog,
  feishuApps,
  disabled = false,
  onPreview,
}: {
  destinationCatalog: DestinationCatalog;
  feishuApps: FeishuAppListItem[];
  disabled?: boolean;
  onPreview: DestinationSubmitHandler<PreviewDestinationFormInput>;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { createDestination, invalidateDestinations } = useDestinationMutations();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || pending}
            title={t("destinations.page.addTitle")}
            className="w-fit"
          />
        }
      >
        <RiAddLine data-icon="inline-start" aria-hidden />
        {t("common.actions.add")}
      </DialogTrigger>

      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t("destinations.form.create.title")}</DialogTitle>
          <DialogDescription>{t("destinations.form.create.description")}</DialogDescription>
        </DialogHeader>

        <CreateDestinationForm
          destinationCatalog={destinationCatalog}
          feishuApps={feishuApps}
          showHeader={false}
          layout="dialog"
          pending={disabled || pending}
          onPreview={onPreview}
          onSubmit={async (data) => {
            setPending(true);
            try {
              await createDestination(data);
              await invalidateDestinations();
              setOpen(false);
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
      </ConfigurationDialogContent>
    </Dialog>
  );
}
