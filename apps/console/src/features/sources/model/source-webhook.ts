export { sourceWebhookPath } from "@tocsin/core";

import { sourceWebhookPath } from "@tocsin/core";

import { urlFromCurrentOrigin } from "#/lib/browser";

export function sourceWebhookUrlFromPath(path: string): string {
  return urlFromCurrentOrigin(path);
}

export function sourceWebhookUrl(sourceId: string): string {
  return sourceWebhookUrlFromPath(sourceWebhookPath(sourceId));
}
