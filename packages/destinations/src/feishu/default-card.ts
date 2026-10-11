import { JsonObjectSchema } from "@tocsin/core";
import type { JsonObject } from "@tocsin/core";

import type { FeishuCardV2 } from "#destinations/feishu/card.types";

const defaultFeishuCardTemplateDefinition = {
  schema: "2.0",
  config: {
    width_mode: "compact",
    enable_forward: true,
    summary: {
      content: "[{{event.statusDisplay}}] [{{event.severityDisplay}}] {{event.title}}",
    },
  },
  header: {
    template: "{{bindings.statusColor}}",
    title: {
      tag: "plain_text",
      content: "{{event.title}}",
    },
    subtitle: {
      tag: "plain_text",
      content: "{{source.name}} · {{event.occurredAtDisplay}}",
    },
    text_tag_list: [
      {
        tag: "text_tag",
        text: {
          tag: "plain_text",
          content: "{{event.severityDisplay}}",
        },
        color: "grey",
      },
      {
        tag: "text_tag",
        text: {
          tag: "plain_text",
          content: "{{event.statusDisplay}}",
        },
        color: "{{bindings.statusColor}}",
      },
    ],
  },
  body: {
    direction: "vertical",
    padding: "12px 12px 10px 12px",
    vertical_spacing: "8px",
    elements: [
      {
        tag: "markdown",
        content: "**{{presentation.labels.summary}}**\n{{event.message}}",
        text_size: "normal",
      },
      {
        tag: "column_set",
        flex_mode: "bisect",
        background_style: "grey",
        columns: [
          {
            tag: "column",
            width: "weighted",
            weight: 1,
            vertical_spacing: "4px",
            elements: [
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: "**{{presentation.labels.status}}**\n{{event.statusDisplay}}",
                  text_size: "notation",
                },
              },
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: "**{{presentation.labels.source}}**\n{{source.name}}",
                  text_size: "notation",
                },
              },
            ],
          },
          {
            tag: "column",
            width: "weighted",
            weight: 1,
            vertical_spacing: "4px",
            elements: [
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: "**{{presentation.labels.severity}}**\n{{event.severityDisplay}}",
                  text_size: "notation",
                },
              },
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: "**{{presentation.labels.provider}}**\n{{source.provider}}",
                  text_size: "notation",
                },
              },
            ],
          },
        ],
      },
      {
        tag: "hr",
      },
      {
        tag: "markdown",
        content:
          "{{presentation.labels.fingerprint}}: `{{event.fingerprint}}` · {{presentation.labels.eventId}}: `{{event.id}}` · {{presentation.labels.destination}}: {{destination.name}}",
        text_size: "notation",
      },
    ],
  },
} satisfies FeishuCardV2;

export const defaultFeishuCardTemplate: JsonObject = JsonObjectSchema.parse(
  defaultFeishuCardTemplateDefinition,
);

export const BUILT_IN_FEISHU_ALERT_CARD_ID = "feishu.alert-card" as const;
export const BUILT_IN_FEISHU_ALERT_CARD_VERSION = 1 as const;

export function resolveBuiltInFeishuCardTemplate(input: {
  id: typeof BUILT_IN_FEISHU_ALERT_CARD_ID;
  version: typeof BUILT_IN_FEISHU_ALERT_CARD_VERSION;
}): JsonObject {
  if (
    input.id !== BUILT_IN_FEISHU_ALERT_CARD_ID ||
    input.version !== BUILT_IN_FEISHU_ALERT_CARD_VERSION
  ) {
    throw new Error(`Unknown built-in Feishu template: ${input.id}@${input.version}`);
  }

  return defaultFeishuCardTemplate;
}
