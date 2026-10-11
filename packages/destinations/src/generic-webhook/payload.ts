import type { JsonValue } from "@tocsin/core";

import type { GenericWebhookConfig } from "#destinations/generic-webhook/schema";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

export function renderGenericWebhookPayload(
  input: DestinationSendInput<GenericWebhookConfig>,
): JsonValue {
  const template = input.config.template;

  // A JSON payload template replaces the whole default envelope: the operator
  // owns the outbound shape. Only string leaves are interpolated, and only
  // allow-listed variables resolve, so the config's url/headers are never
  // injected into the outbound body.
  if (template?.mode === "json_payload") {
    return DestinationTemplateEngine.renderJsonOrThrow(
      DestinationTemplateEngine.createRenderContext(input),
      template.payload,
      "template.payload",
      template.bindings,
    );
  }

  return {
    eventId: input.eventId,
    source: {
      id: input.source.id,
      name: input.source.name,
      provider: input.source.provider,
    },
    destination: {
      id: input.destination.id,
      name: input.destination.name,
      kind: input.destination.kind,
    },
    alert: input.normalizedEvent,
    message:
      template?.mode === "text"
        ? DestinationTemplateEngine.renderTextOrThrow(
            DestinationTemplateEngine.createRenderContext(input),
            template.text,
            "template.text",
            template.bindings,
          )
        : input.normalizedEvent.message,
  };
}
