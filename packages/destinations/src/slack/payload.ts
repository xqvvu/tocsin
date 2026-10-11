import type { JsonObject, JsonValue } from "@tocsin/core";

import {
  destinationCopy,
  displaySeverity,
  displayStatus,
  formatDestinationDateTime,
} from "#destinations/presentation";
import type { SlackConfig } from "#destinations/slack/schema";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

export function renderSlackPayload(input: DestinationSendInput<SlackConfig>): JsonValue {
  const event = input.normalizedEvent;
  const labels = destinationCopy(input.presentation).labels;
  const severity = displaySeverity(event.severity, input.presentation);
  const template = input.config.template;

  // A blocks template replaces the whole Slack payload: the operator owns the
  // body ({ text?, blocks: [...] }). Only string leaves are interpolated and
  // only allow-listed variables resolve, so the webhook URL never leaks in.
  if (template?.mode === "slack_blocks") {
    return DestinationTemplateEngine.renderJsonOrThrow(
      DestinationTemplateEngine.createRenderContext(input),
      template.payload,
      "template.payload",
      template.bindings,
    );
  }

  const message =
    template?.mode === "text"
      ? DestinationTemplateEngine.renderTextOrThrow(
          DestinationTemplateEngine.createRenderContext(input),
          template.text,
          "template.text",
          template.bindings,
        )
      : event.message;
  const labelText = Object.entries(event.labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  const fields: JsonObject[] = [
    markdownField(labels.severity, severity),
    markdownField(labels.status, displayStatus(event.status, input.presentation)),
    markdownField(labels.source, input.source.name),
    markdownField(labels.fingerprint, event.fingerprint),
    markdownField(
      labels.occurredAt,
      formatDestinationDateTime(event.occurredAt, input.presentation),
    ),
    markdownField(labels.eventId, input.eventId),
  ];

  if (labelText) {
    fields.push(markdownField(labels.labels, labelText));
  }

  return {
    text: `[${severity}] ${event.title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `[${severity}] ${event.title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      },
      {
        type: "section",
        fields,
      },
    ],
  };
}

function markdownField(label: string, value: string): JsonObject {
  return {
    type: "mrkdwn",
    text: `*${label}:*\n${value}`,
  };
}
