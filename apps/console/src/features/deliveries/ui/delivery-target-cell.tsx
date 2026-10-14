import { RiQuestionLine } from "@remixicon/react";

import { DestinationKindIcon } from "#/features/destinations/ui/destination-kind-icon";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The catalog `iconName` for a delivery row's destination kind, resolved by
 * `deliveries-table.tsx`:
 *
 * - a `string` is a declared icon name;
 * - `undefined` means the kind exists in the catalog but declares no icon name;
 * - `null` means the catalog has no entry for the row's kind at all (an older
 *   snapshot, or a kind that no longer exists), so the cell shows a neutral
 *   glyph and says so instead of guessing a brand mark.
 */
export type DeliveryDestinationIconName = string | null | undefined;

export function DeliveryTargetCell({
  destinationName,
  destinationIconName,
  routeName,
}: {
  destinationName: string;
  destinationIconName: DeliveryDestinationIconName;
  routeName: string | null;
}) {
  const t = useTranslations();
  const unknownKind = destinationIconName === null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="border-border bg-muted/70 flex size-8 shrink-0 items-center justify-center border"
        title={unknownKind ? t("deliveries.table.unknownKind") : undefined}
      >
        {unknownKind ? (
          <RiQuestionLine className="text-muted-foreground size-3.5" aria-hidden />
        ) : (
          <DestinationKindIcon iconName={destinationIconName} />
        )}
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium" title={destinationName}>
          {destinationName}
        </div>
        <div
          className="text-muted-foreground truncate text-[11px]"
          title={routeName ?? t("deliveries.table.manual")}
        >
          {routeName ?? t("deliveries.table.manual")}
        </div>
      </div>
    </div>
  );
}
