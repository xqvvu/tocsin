import { defineAdapterTemplateConfigField } from "@tocsin/core";

import type { DestinationManifest } from "#destinations/types";

export const feishuManifest = {
  kind: "feishu",
  configVersion: 1,
  lifecycle: {
    status: "stable",
  },
  displayNameKey: "destinations.kinds.feishu",
  descriptionKey: "destinations.table.safeConfig.feishu",
  iconName: "feishu",
  configFields: [
    {
      type: "select",
      path: "sendMode",
      labelKey: "destinations.form.feishuSendMode",
      descriptionKey: "destinations.form.feishuSendModeDescription",
      options: [
        {
          value: "webhook",
          labelKey: "destinations.form.feishuSendModeWebhook",
        },
        {
          value: "app",
          labelKey: "destinations.form.feishuSendModeApp",
        },
      ],
    },
    {
      type: "url",
      path: "webhookUrl",
      labelKey: "destinations.form.feishuWebhookUrl",
      sensitive: true,
    },
    {
      type: "secret",
      path: "signSecret",
      labelKey: "destinations.form.signSecret",
      placeholderKey: "destinations.form.optionalPlaceholder",
      sensitive: true,
    },
    {
      type: "text",
      path: "app.appRef",
      labelKey: "destinations.form.feishuAppRef",
      descriptionKey: "destinations.form.feishuAppRefDescription",
    },
    {
      type: "text",
      path: "app.chatId",
      labelKey: "destinations.form.feishuChatId",
      placeholderKey: "destinations.form.feishuChatIdPlaceholder",
      descriptionKey: "destinations.form.feishuChatIdDescription",
    },
    {
      type: "boolean",
      path: "urgent.autoEnabled",
      labelKey: "destinations.form.feishuUrgentAutoEnabled",
      descriptionKey: "destinations.form.feishuUrgentAutoEnabledDescription",
    },
    {
      type: "string-list",
      path: "urgent.severities",
      labelKey: "destinations.form.feishuUrgentSeverities",
      descriptionKey: "destinations.form.feishuUrgentSeveritiesDescription",
    },
    {
      type: "select",
      path: "urgent.userIdType",
      labelKey: "destinations.form.feishuUrgentUserIdType",
      descriptionKey: "destinations.form.feishuUrgentUserIdTypeDescription",
      options: [
        {
          value: "open_id",
          labelKey: "destinations.form.feishuUserIdTypeOpenId",
        },
        {
          value: "user_id",
          labelKey: "destinations.form.feishuUserIdTypeUserId",
        },
        {
          value: "union_id",
          labelKey: "destinations.form.feishuUserIdTypeUnionId",
        },
      ],
    },
    {
      type: "string-list",
      path: "urgent.receivers",
      labelKey: "destinations.form.feishuUrgentReceivers",
      descriptionKey: "destinations.form.feishuUrgentReceiversDescription",
    },
    defineAdapterTemplateConfigField({
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
          mode: "feishu_card",
          labelKey: "destinations.form.templateModeFeishuCard",
          help: {
            labelKey: "destinations.form.feishuCardTemplateHelpLabel",
            descriptionKey: "destinations.form.feishuCardTemplateHelp",
            links: [
              {
                labelKey: "destinations.form.feishuCardJsonDocs",
                href: "https://open.feishu.cn/document/feishu-cards/card-json-structure",
              },
            ],
          },
        },
      ],
    }),
  ],
  secretFields: [
    {
      path: "webhookUrl",
      kind: "webhook_url",
      envHint: "FEISHU_WEBHOOK_URL",
      labelKey: "destinations.form.feishuWebhookUrl",
    },
    {
      path: "signSecret",
      kind: "signing_secret",
      envHint: "FEISHU_SIGN_SECRET",
      labelKey: "destinations.form.signSecret",
    },
  ],
  capabilities: {
    preview: true,
    test: true,
    delivery: true,
  },
} satisfies DestinationManifest<"feishu">;
