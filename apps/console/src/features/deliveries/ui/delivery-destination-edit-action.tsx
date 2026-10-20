import { RiEditLine } from "@remixicon/react";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import type { DeliveryState } from "@tocsin/core";

import { Button } from "#/components/ui/button";
import { DestinationEditDialogLoader } from "#/features/destinations/ui/destination-edit-dialog-loader";
import { operationsQueryKeys } from "#/features/operations/api/operations.queries";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Fixes the destination configuration without leaving a failed delivery.
 *
 * Only failed deliveries show the action: that is the state where the operator
 * has a reason to correct the target and then retry. Retrying stays an explicit
 * second click — the edit dialog never sends anything on its own.
 */
export function DeliveryDestinationEditAction({
  deliveryId,
  destinationId,
  state,
}: {
  deliveryId: string;
  destinationId: string;
  state: DeliveryState;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  if (state !== "failed") {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => {
          setOpen(true);
        }}
      >
        <RiEditLine data-icon="inline-start" aria-hidden />
        {t("deliveries.detail.editDestination.action")}
      </Button>
      <DestinationEditDialogLoader
        destinationId={destinationId}
        open={open}
        onOpenChange={setOpen}
        onSaved={() =>
          queryClient.invalidateQueries({
            queryKey: operationsQueryKeys.deliveryDetail(deliveryId),
          })
        }
      />
    </>
  );
}
