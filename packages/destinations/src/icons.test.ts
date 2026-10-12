import { describe, expect, it } from "vite-plus/test";

import { emailManifest } from "#destinations/email/manifest";
import { feishuManifest } from "#destinations/feishu/manifest";
import { genericWebhookManifest } from "#destinations/generic-webhook/manifest";
import { destinationIconAssetUrl } from "#destinations/icons";
import { slackManifest } from "#destinations/slack/manifest";

import larkIconUrl from "../assets/destination-icons/lark.svg?url";
import slackIconUrl from "../assets/destination-icons/slack.svg?url";
import telegramIconUrl from "../assets/destination-icons/telegram.svg?url";
import webhookIconUrl from "../assets/destination-icons/webhook.svg?url";

describe("destination icon assets", () => {
  it("resolves the default manifests' asset-backed icon names", () => {
    // Feishu's icon id and file name differ on purpose: the adapter ships the
    // Lark brand mark under `lark.svg` while the catalog says `feishu`.
    expect(destinationIconAssetUrl(feishuManifest.iconName)).toBe(larkIconUrl);
    expect(destinationIconAssetUrl(slackManifest.iconName)).toBe(slackIconUrl);
    expect(destinationIconAssetUrl(genericWebhookManifest.iconName)).toBe(webhookIconUrl);
  });

  it("resolves an icon name a future adapter can reuse without a console change", () => {
    // `telegram.svg` ships with the package but no adapter declares it yet: the
    // registry is keyed by icon name, so reusing it costs a manifest field only.
    expect(destinationIconAssetUrl("telegram")).toBe(telegramIconUrl);
  });

  it("leaves the email manifest's glyph icon name to the console", () => {
    // Email has no asset file; the console renders a Remix Icon glyph for it
    // (see `destination-kind-icon.tsx`). The asset registry must not invent one.
    expect(destinationIconAssetUrl(emailManifest.iconName)).toBeUndefined();
  });

  it("returns undefined for unknown or missing icon names", () => {
    expect(destinationIconAssetUrl("discord")).toBeUndefined();
    expect(destinationIconAssetUrl(undefined)).toBeUndefined();
    // Prototype keys are not own entries: a hostile or sloppy icon name must
    // not resolve to `Object.prototype.constructor`.
    expect(destinationIconAssetUrl("constructor")).toBeUndefined();
  });
});
