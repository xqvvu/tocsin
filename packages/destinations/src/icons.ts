import larkIconUrl from "../assets/destination-icons/lark.svg?url";
import slackIconUrl from "../assets/destination-icons/slack.svg?url";
import telegramIconUrl from "../assets/destination-icons/telegram.svg?url";
import webhookIconUrl from "../assets/destination-icons/webhook.svg?url";

/**
 * Bundled icon assets keyed by the `iconName` a destination manifest declares.
 *
 * This is the name → asset half of the contract ADR 0002 describes: adapters
 * ship an icon id, the console maps it to a bundled URL and owns the fallback
 * when the id is unknown. Keep entries keyed by `iconName` (not by kind), so a
 * new adapter reusing an existing icon needs no console change; the file name
 * is the brand asset's own name and can differ from the icon id (the Feishu
 * adapter uses the Lark mark).
 *
 * A manifest `iconName` with no entry here resolves to `undefined` and the
 * console renders its generic glyph instead of a broken/blank cell.
 */
const DestinationIconAssets: Readonly<Record<string, string>> = {
  feishu: larkIconUrl,
  slack: slackIconUrl,
  telegram: telegramIconUrl,
  webhook: webhookIconUrl,
};

/** Resolves a manifest `iconName` to its bundled asset URL, or `undefined` when unknown. */
export function destinationIconAssetUrl(iconName: string | undefined): string | undefined {
  if (iconName === undefined || !Object.hasOwn(DestinationIconAssets, iconName)) {
    return undefined;
  }

  return DestinationIconAssets[iconName];
}
