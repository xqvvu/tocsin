import { RiAddLine } from "@remixicon/react";
import * as React from "react";

import type { DestinationListItem, SourceSummary } from "@tocsin/core";

import { ConfigurationDialogContent } from "#/components/common/configuration-dialog-content";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import {
  CreateSuppressionForm,
  type SuppressionFormSubmission,
} from "#/features/suppressions/ui/suppression-forms";
import { useTranslations } from "#/i18n/use-i18n";

export function SuppressionAddDialog({
  sources,
  destinations,
  disabled = false,
  pending,
  onSubmit,
}: {
  sources: SourceSummary[];
  destinations: DestinationListItem[];
  disabled?: boolean;
  pending: boolean;
  onSubmit: (input: SuppressionFormSubmission) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);

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
            title={t("suppressions.page.addTitle")}
            className="w-fit"
          />
        }
      >
        <RiAddLine data-icon="inline-start" aria-hidden />
        {t("common.actions.add")}
      </DialogTrigger>

      <ConfigurationDialogContent>
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t("suppressions.form.create.title")}</DialogTitle>
          <DialogDescription>{t("suppressions.form.create.description")}</DialogDescription>
        </DialogHeader>

        <CreateSuppressionForm
          showHeader={false}
          sources={sources}
          destinations={destinations}
          layout="dialog"
          pending={disabled || pending}
          onSubmit={(input) => {
            onSubmit(input);
            setOpen(false);
          }}
        />
      </ConfigurationDialogContent>
    </Dialog>
  );
}
