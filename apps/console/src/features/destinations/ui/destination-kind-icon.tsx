import { RiMailLine, RiQuestionLine } from "@remixicon/react";

import { destinationIconAssetUrl } from "@tocsin/destinations/icons";

import type { DestinationCatalog } from "#/features/destinations/model/destination-types";

/**
 * Icon names the console renders with an inline glyph instead of a bundled
 * asset. Email ships a Remix Icon rather than a brand SVG, so its manifest
 * `iconName` resolves here; every other branded name comes from the
 * `@tocsin/destinations/icons` asset registry.
 */
const DestinationIconGlyphs: Readonly<Record<string, typeof RiMailLine>> = {
  mail: RiMailLine,
};

/**
 * A destination's catalog icon.
 *
 * `iconName` is the manifest-declared icon id projected into the client-safe
 * catalog; the console owns the mapping to a bundled asset or inline glyph.
 * Unknown or missing names fall back to a neutral glyph, so a new adapter can
 * never render a blank cell. The icon is decorative (`aria-hidden`) and sits
 * next to the destination's text label, which carries the meaning.
 */
export function DestinationKindIcon({ iconName }: { iconName: string | undefined }) {
  const assetUrl = destinationIconAssetUrl(iconName);

  if (assetUrl) {
    return <img className="size-5 object-contain" src={assetUrl} alt="" aria-hidden />;
  }

  const Glyph =
    iconName !== undefined && Object.hasOwn(DestinationIconGlyphs, iconName)
      ? DestinationIconGlyphs[iconName]
      : RiQuestionLine;

  return <Glyph className="text-muted-foreground size-4" aria-hidden />;
}

/**
 * Every kind in the client-safe catalog mapped to the `iconName` its manifest
 * declares, so list cells can resolve an icon without a console-side kind list.
 */
export function destinationIconNamesByKind(
  catalog: DestinationCatalog,
): ReadonlyMap<string, string | undefined> {
  return new Map(catalog.map((item) => [item.kind, item.iconName]));
}
