import { RiShieldCheckLine } from "@remixicon/react";
import * as React from "react";

import type { DestinationListItem } from "@tocsin/core";

import { IconTooltip } from "#/components/common/icon-tooltip";
import { Button } from "#/components/ui/button";
import { Dialog, DialogTrigger } from "#/components/ui/dialog";
import { SuppressionFromDestinationDialogContent } from "#/features/suppressions/ui/suppression-from-destination-dialog-content";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Silences one notification target from its row, without leaving the
 * destinations list.
 *
 * The form is prefilled with `matcher.destinationIds = [destination.id]` only:
 * the operator is muting this target for everything it receives, while every
 * other destination keeps delivering. The window and any additional narrowing
 * conditions stay editable because a suppression outlives the incident that
 * prompted it.
 */
export function SuppressionFromDestinationDialog({
  destination,
  disabled = false,
}: {
  destination: DestinationListItem;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const actionLabel = t("destinations.table.actions.silenceTitle", { name: destination.name });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          setOpen(nextOpen);
        }
      }}
    >
      <IconTooltip label={actionLabel}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled || pending}
              aria-label={actionLabel}
            />
          }
        >
          <RiShieldCheckLine data-icon="inline-start" aria-hidden />
        </DialogTrigger>
      </IconTooltip>

      {open ? (
        <SuppressionFromDestinationDialogContent
          destination={destination}
          pending={pending}
          onPendingChange={setPending}
          onSaved={() => setOpen(false)}
        />
      ) : null}
    </Dialog>
  );
}
