import { RiQuestionLine } from "@remixicon/react";

import type { DestinationFormKind } from "#/features/destinations/model/destination-form";
import { DestinationKindIcon } from "#/features/destinations/ui/destination-kind-icon";
import { useTranslations } from "#/i18n/use-i18n";

const KNOWN_KINDS: readonly string[] = ["generic_webhook", "feishu", "slack", "email"];

function isKnownKind(kind: string | undefined): kind is DestinationFormKind {
  return kind !== undefined && KNOWN_KINDS.includes(kind);
}

export function DeliveryTargetCell({
  destinationName,
  destinationKind,
  routeName,
}: {
  destinationName: string;
  destinationKind?: string;
  routeName: string | null;
}) {
  const t = useTranslations();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="border-border bg-muted/70 flex size-6 shrink-0 items-center justify-center border"
        // The kind can be absent on rows read back from an older snapshot; show
        // a neutral glyph rather than an empty box or a wrong brand mark.
        title={isKnownKind(destinationKind) ? undefined : t("deliveries.table.unknownKind")}
      >
        {isKnownKind(destinationKind) ? (
          <DestinationKindIcon kind={destinationKind} />
        ) : (
          <RiQuestionLine className="text-muted-foreground size-3.5" aria-hidden />
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
