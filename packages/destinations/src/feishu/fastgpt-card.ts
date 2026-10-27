import { JsonObjectSchema } from "@tocsin/core";
import type { JsonObject, NormalizedEvent } from "@tocsin/core";

import type { FeishuCardV2 } from "#destinations/feishu/card.types";

export function createFastgptModelProbeCardTemplate(input: { event: NormalizedEvent }): JsonObject {
  const labels = input.event.labels;
  const details: FeishuCardV2["body"]["elements"] = [];

  const modelLabel = labels.model_name ? "model_name" : labels.model ? "model" : "model_id";
  if (labels.model_id) {
    details.push(field("presentation.labels.modelId", "`{{event.labels.model_id}}`"));
  }

  if (labels.model_provider || labels.model_type) {
    const providerType = [
      labels.model_provider ? "{{event.labels.model_provider}}" : null,
      modelTypeLabel(labels.model_type),
    ]
      .filter((value): value is string => value !== null)
      .join(" · ");
    details.push(field("presentation.labels.modelProviderAndType", providerType));
  }

  if (labels.probe_attempts) {
    details.push(field("presentation.labels.attempts", "{{event.labels.probe_attempts}}"));
  }

  if (labels.probe_latency_ms) {
    details.push(field("presentation.labels.responseTime", "{{event.labels.probe_latency_ms}} ms"));
  }

  if (labels.probe_error) {
    details.push(field("presentation.labels.probeError", "{{event.labels.probe_error}}"));
  }

  const metadata: FeishuCardV2["body"]["elements"] = [];
  const bodyElements: FeishuCardV2["body"]["elements"] = [
    {
      tag: "markdown",
      content: `**{{event.labels.${modelLabel}}}**\n${probeStatusLabel(input.event.status)}`,
      text_size: "normal",
    },
  ];

  if (details.length === 1) {
    bodyElements.push(details[0]!);
  } else if (details.length > 1) {
    const splitAt = Math.ceil(details.length / 2);
    bodyElements.push({
      tag: "column_set",
      flex_mode: "bisect",
      background_style: "grey",
      columns: [
        {
          tag: "column",
          width: "weighted",
          weight: 1,
          vertical_spacing: "4px",
          elements: details.slice(0, splitAt),
        },
        {
          tag: "column",
          width: "weighted",
          weight: 1,
          vertical_spacing: "4px",
          elements: details.slice(splitAt),
        },
      ],
    });
  }

  bodyElements.push({ tag: "hr" });
  metadata.push({
    tag: "markdown",
    content: "{{presentation.labels.eventId}}: `{{event.id}}`",
    text_size: "notation",
  });

  const definition = {
    schema: "2.0",
    config: {
      width_mode: "compact",
      enable_forward: true,
      summary: {
        content: "{{presentation.labels.fastgptModelProbe}} · {{event.statusDisplay}}",
      },
    },
    header: {
      template: "{{bindings.statusColor}}",
      title: {
        tag: "plain_text",
        content: "{{presentation.labels.fastgptModelProbe}}",
      },
      subtitle: {
        tag: "plain_text",
        content: "{{event.occurredAtDisplay}}",
      },
      text_tag_list: [
        {
          tag: "text_tag",
          text: { tag: "plain_text", content: "{{event.statusDisplay}}" },
          color: "{{bindings.statusColor}}",
        },
        {
          tag: "text_tag",
          text: { tag: "plain_text", content: "{{event.severityDisplay}}" },
          color: "grey",
        },
      ],
    },
    body: {
      direction: "vertical",
      padding: "12px 12px 10px 12px",
      vertical_spacing: "8px",
      elements: [...bodyElements, ...metadata],
    },
  } satisfies FeishuCardV2;

  return JsonObjectSchema.parse(definition);
}

function probeStatusLabel(status: NormalizedEvent["status"]): string {
  switch (status) {
    case "firing":
      return "{{presentation.labels.probeFailed}}";
    case "resolved":
      return "{{presentation.labels.probeRecovered}}";
    case "unknown":
      return "{{presentation.labels.probeUnknown}}";
  }
}

function field(labelPath: string, value: string): FeishuCardV2["body"]["elements"][number] {
  return {
    tag: "div",
    text: {
      tag: "lark_md",
      content: `**{{${labelPath}}}**\n${value}`,
      text_size: "notation",
    },
  };
}

function modelTypeLabel(value: string | undefined): string | null {
  if (!value) return null;
  switch (value.toLowerCase()) {
    case "llm":
      return "{{presentation.labels.modelTypeLlm}}";
    case "tts":
      return "{{presentation.labels.modelTypeTts}}";
    default:
      return "{{event.labels.model_type}}";
  }
}
