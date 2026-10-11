import type { JsonValue } from "@tocsin/core";

import type { EmailConfig } from "#destinations/email/schema";
import {
  destinationCopy,
  displaySeverity,
  displayStatus,
  formatDestinationDateTime,
} from "#destinations/presentation";
import { DestinationTemplateEngine } from "#destinations/template";
import type { DestinationSendInput } from "#destinations/types";

export function renderEmailPayload(
  input: DestinationSendInput<EmailConfig>,
  config: EmailConfig,
): JsonValue {
  const event = input.normalizedEvent;
  const subject = renderEmailSubject(input, config);
  const text =
    config.template?.mode === "text"
      ? DestinationTemplateEngine.renderTextOrThrow(
          DestinationTemplateEngine.createRenderContext(input),
          config.template.text,
          "template.text",
          config.template.bindings,
        )
      : renderEmailText(input);
  return {
    subject,
    text,
    html: renderEmailHtml(input, config, text),
    metadata: {
      eventId: input.eventId,
      sourceId: input.source.id,
      destinationId: input.destination.id,
      fingerprint: event.fingerprint,
      severity: event.severity,
      status: event.status,
    },
  };
}

export function renderEmailRequestPayload(
  input: DestinationSendInput<EmailConfig>,
  config: EmailConfig,
): JsonValue {
  const payload: {
    to: string[];
    from: string;
    replyTo?: string;
    subject: string;
    text: string;
    html: string;
    metadata: Record<string, string>;
  } = {
    ...(renderEmailPayload(input, config) as {
      subject: string;
      text: string;
      html: string;
      metadata: Record<string, string>;
    }),
    to: config.to,
    from: config.from,
  };

  if (config.replyTo) {
    payload.replyTo = config.replyTo;
  }

  return payload;
}

/**
 * Subject line for one event.
 *
 * `subjectTemplate` owns the subject outright when set — the prefix is then
 * ignored, so the operator decides the whole line. Without it the built-in
 * `[severity status] title` shape (plus optional prefix) is rendered exactly as
 * before.
 */
function renderEmailSubject(input: DestinationSendInput<EmailConfig>, config: EmailConfig): string {
  if (config.subjectTemplate) {
    return DestinationTemplateEngine.renderTextOrThrow(
      DestinationTemplateEngine.createRenderContext(input),
      config.subjectTemplate,
      "subjectTemplate",
      config.template?.bindings,
    );
  }

  const event = input.normalizedEvent;
  const subjectPrefix = config.subjectPrefix ? `${config.subjectPrefix.trim()} ` : "";

  return `${subjectPrefix}[${displaySeverity(event.severity, input.presentation)} ${displayStatus(event.status, input.presentation)}] ${event.title}`;
}

function renderEmailText(input: DestinationSendInput<EmailConfig>): string {
  const event = input.normalizedEvent;
  const labels = destinationCopy(input.presentation).labels;
  const labelText = Object.entries(event.labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");

  return [
    `[${displaySeverity(event.severity, input.presentation)} ${displayStatus(event.status, input.presentation)}] ${event.title}`,
    "",
    event.message,
    "",
    `${labels.source}: ${input.source.name}`,
    `${labels.fingerprint}: ${event.fingerprint}`,
    `${labels.occurredAt}: ${formatDestinationDateTime(event.occurredAt, input.presentation)}`,
    `${labels.eventId}: ${input.eventId}`,
    labelText ? `${labels.labels}: ${labelText}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * HTML alternative for the email body.
 *
 * A `htmlTemplate` replaces the auto-generated block. Its markup is trusted
 * (the operator wrote it) and every interpolated value goes through
 * `escapeHtml`, so an event field carrying `<script>` stays inert text. Leaving
 * the template unset keeps the previous behaviour: the rendered text body
 * escaped into a single <pre>.
 */
function renderEmailHtml(
  input: DestinationSendInput<EmailConfig>,
  config: EmailConfig,
  text: string,
): string {
  if (config.htmlTemplate) {
    return DestinationTemplateEngine.renderTextOrThrow(
      DestinationTemplateEngine.createRenderContext(input),
      config.htmlTemplate,
      "htmlTemplate",
      config.template?.bindings,
      { escape: escapeHtml },
    );
  }

  return `<pre>${escapeHtml(text)}</pre>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
