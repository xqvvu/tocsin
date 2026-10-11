import { RiMailLine } from "@remixicon/react";

import larkIconUrl from "@tocsin/destinations/assets/destination-icons/lark.svg?url";
import slackIconUrl from "@tocsin/destinations/assets/destination-icons/slack.svg?url";
import webhookIconUrl from "@tocsin/destinations/assets/destination-icons/webhook.svg?url";

import type { DestinationFormKind } from "#/features/destinations/model/destination-form";

export function DestinationKindIcon({ kind }: { kind: DestinationFormKind }) {
  if (kind === "email") {
    return <RiMailLine className="text-muted-foreground size-4" aria-hidden />;
  }

  return (
    <img className="size-5 object-contain" src={destinationKindIconUrl(kind)} alt="" aria-hidden />
  );
}

function destinationKindIconUrl(kind: Exclude<DestinationFormKind, "email">): string {
  switch (kind) {
    case "feishu":
      return larkIconUrl;
    case "slack":
      return slackIconUrl;
    case "generic_webhook":
      return webhookIconUrl;
  }
}
