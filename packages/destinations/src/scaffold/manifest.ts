import type { DestinationManifest } from "#destinations/types";

/**
 * JSON-safe description of the adapter (ADR 0002): the client-safe catalog the
 * console renders is projected from this object, and the registry audit checks
 * it against `configSchema` and the console's i18n keys.
 */
export const genericWebhookManifest = {
  kind: "generic_webhook",
  configVersion: 1,
  lifecycle: {
    status: "experimental",
  },
  displayNameKey: "destinations.kinds.generic_webhook",
  descriptionKey: "destinations.table.safeConfig.generic_webhook",
  iconName: "webhook",
  configFields: [
    {
      type: "url",
      path: "webhookUrl",
      labelKey: "destinations.form.webhookUrl",
      required: true,
      sensitive: true,
    },
    {
      type: "template",
      path: "template",
      labelKey: "destinations.form.template",
      descriptionKey: "destinations.form.templateDescription",
      modes: [
        {
          mode: "text",
          labelKey: "destinations.form.templateModeText",
        },
      ],
    },
  ],
  secretFields: [
    {
      path: "webhookUrl",
      kind: "webhook_url",
      envHint: "GENERIC_WEBHOOK_URL",
      labelKey: "destinations.form.webhookUrl",
    },
  ],
  capabilities: {
    preview: true,
    test: true,
    delivery: true,
  },
} satisfies DestinationManifest<"generic_webhook">;
