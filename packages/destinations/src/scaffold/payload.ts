import type { JsonValue } from "@tocsin/core";

import { destinationCopy, displaySeverity, displayStatus } from "#destinations/presentation";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

import type { GenericWebhookConfig } from "./schema";

/**
 * Renders the safe debug payload used by preview and Delivery detail. It must
 * never carry secrets: the webhook URL stays out of the payload, and the
 * template engine only resolves allow-listed variables.
 */
export function renderGenericWebhookPayload(
  input: DestinationSendInput<GenericWebhookConfig>,
): JsonValue {
  const event = input.normalizedEvent;
  const template = input.config.template;
  const message =
    template?.mode === "text"
      ? DestinationTemplateEngine.renderTextOrThrow(
          DestinationTemplateEngine.createRenderContext(input),
          template.text,
          "template.text",
          template.bindings,
        )
      : event.message;

  return {
    title: `[${displaySeverity(event.severity, input.presentation)}] ${event.title}`,
    message,
    status: displayStatus(event.status, input.presentation),
    source: input.source.name,
    fingerprint: event.fingerprint,
    occurredAt: event.occurredAt,
    severityLabel: destinationCopy(input.presentation).labels.severity,
  };
}
