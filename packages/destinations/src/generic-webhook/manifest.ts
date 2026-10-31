import type { DestinationManifest } from "#destinations/types";

export const genericWebhookManifest = {
  kind: "generic_webhook",
  configVersion: 1,
  lifecycle: {
    status: "stable",
  },
  displayNameKey: "destinations.kinds.generic_webhook",
  descriptionKey: "destinations.table.safeConfig.generic_webhook",
  iconName: "webhook",
  configFields: [
    {
      type: "url",
      path: "url",
      labelKey: "destinations.form.webhookUrl",
      required: true,
      sensitive: true,
    },
    {
      type: "select",
      path: "method",
      labelKey: "destinations.form.method",
      descriptionKey: "destinations.form.methodDescription",
      defaultValue: "POST",
      options: [
        { value: "POST", labelKey: "destinations.form.methodOptions.POST" },
        { value: "PUT", labelKey: "destinations.form.methodOptions.PUT" },
        { value: "PATCH", labelKey: "destinations.form.methodOptions.PATCH" },
      ],
    },
    {
      type: "key-value",
      path: "headers",
      labelKey: "destinations.form.headers",
      descriptionKey: "destinations.form.headersDescription",
      sensitive: true,
      valueSensitive: true,
    },
    {
      type: "boolean",
      path: "idempotencyKey",
      labelKey: "destinations.form.idempotencyKey",
      descriptionKey: "destinations.form.idempotencyKeyDescription",
      defaultValue: false,
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
        {
          mode: "json_payload",
          labelKey: "destinations.form.templateModeJsonPayload",
        },
      ],
    },
  ],
  secretFields: [
    {
      path: "url",
      kind: "webhook_url",
      envHint: "GENERIC_WEBHOOK_URL",
      labelKey: "destinations.form.webhookUrl",
    },
    {
      path: "headers",
      kind: "header",
      envHint: "GENERIC_WEBHOOK_HEADERS",
      labelKey: "destinations.form.headers",
    },
  ],
  capabilities: {
    preview: true,
    test: true,
    delivery: true,
  },
} satisfies DestinationManifest<"generic_webhook">;
