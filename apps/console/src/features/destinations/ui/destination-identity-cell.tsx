import { DestinationKindIcon } from "#/features/destinations/ui/destination-kind-icon";
import type { DestinationListItem } from "#/features/destinations/ui/destination-ui-types";
import { useTranslations } from "#/i18n/use-i18n";

export function DestinationIdentityCell({
  destination,
  iconName,
}: {
  destination: DestinationListItem;
  /** The `iconName` the destination's catalog entry declares. */
  iconName: string | undefined;
}) {
  const t = useTranslations();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="border-border bg-muted/70 flex size-8 shrink-0 items-center justify-center border">
        <DestinationKindIcon iconName={iconName} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold" title={destination.name}>
          {destination.name}
        </div>
        <div className="text-muted-foreground mt-0.5 flex h-4 min-w-0 items-baseline gap-1.5 text-[11px] leading-4 font-medium uppercase">
          <span>{t(`destinations.kinds.${destination.kind}`)}</span>
          <span aria-hidden>|</span>
          <span className="truncate font-mono lowercase" title={destination.id}>
            {destination.id.slice(0, 12)}
          </span>
        </div>
      </div>
    </div>
  );
}
