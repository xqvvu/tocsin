import type { DestinationManifest } from "#destinations/types";

export const slackManifest = {
  kind: "slack",
  configVersion: 1,
  lifecycle: {
    status: "stable",
  },
  displayNameKey: "destinations.kinds.slack",
  descriptionKey: "destinations.table.safeConfig.slack",
  iconName: "slack",
  configFields: [
    {
      type: "url",
      path: "webhookUrl",
      labelKey: "destinations.form.slackWebhookUrl",
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
        {
          mode: "slack_blocks",
          labelKey: "destinations.form.templateModeSlackBlocks",
        },
      ],
    },
  ],
  secretFields: [
    {
      path: "webhookUrl",
      kind: "webhook_url",
      envHint: "SLACK_WEBHOOK_URL",
      labelKey: "destinations.form.slackWebhookUrl",
    },
  ],
  capabilities: {
    preview: true,
    test: true,
    delivery: true,
  },
} satisfies DestinationManifest<"slack">;
