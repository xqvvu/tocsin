import type { DestinationListItem } from "@tocsin/core";

import { suppressionDefaultsFromDestination } from "#/features/suppressions/model/suppression-form";
import { SuppressionFromRowDialogContent } from "#/features/suppressions/ui/suppression-from-row-dialog-content";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The destination row's silence dialog, prefilled with the row's target only.
 *
 * The copy and the prefilled matcher live here so the shared dialog body stays
 * free of row-specific vocabulary.
 */
export function SuppressionFromDestinationDialogContent({
  destination,
  pending,
  onPendingChange,
  onSaved,
}: {
  destination: DestinationListItem;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations();

  return (
    <SuppressionFromRowDialogContent
      copy={{
        title: t("suppressions.fromDestination.title"),
        description: t("suppressions.fromDestination.description"),
        context: t("suppressions.fromDestination.context", {
          destinationName: destination.name,
        }),
        loadFailed: t("suppressions.fromDestination.loadFailed"),
        loading: t("suppressions.fromDestination.loading"),
        toastSuccess: t("suppressions.fromDestination.toast.success"),
        toastFailed: t("suppressions.fromDestination.toast.failed"),
      }}
      buildDefaults={(timeZone) =>
        suppressionDefaultsFromDestination({
          name: t("suppressions.fromDestination.nameTemplate", { name: destination.name }),
          destinationId: destination.id,
          timeZone,
        })
      }
      pinnedDestination={destination}
      pending={pending}
      onPendingChange={onPendingChange}
      onSaved={onSaved}
    />
  );
}
