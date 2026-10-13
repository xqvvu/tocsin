import { z } from "zod";

import { NormalizedEventSchema } from "#core/event/normalized-event";
import { JsonObjectSchema, JsonValueSchema } from "#core/json";
import { SourceSummarySchema } from "#core/source/source";

export const DestinationKindSchema = z.enum(["generic_webhook", "feishu", "slack", "email"]);
export type DestinationKind = z.infer<typeof DestinationKindSchema>;

export const DestinationSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  kind: DestinationKindSchema,
  enabled: z.boolean(),
});

export type DestinationSummary = z.infer<typeof DestinationSummarySchema>;

/**
 * Operator-visible destination configuration for private / self-hosted deploys.
 *
 * Show operational targets in the authenticated dashboard (endpoint, method,
 * recipients, template mode). Keep true secrets out of this projection:
 * signing secrets, passwords, tokens, and sensitive header values.
 */
export const DestinationOperationalConfigSchema = z.object({
  /** Full operational endpoint/URL when configured (webhook, gateway, etc.). */
  endpoint: z.string().nullable(),
  /** Hostname extracted from endpoint for compact table display. */
  host: z.string().nullable(),
  method: z.enum(["POST", "PUT", "PATCH"]).nullable(),
  to: z.array(z.string()).nullable(),
  from: z.string().nullable(),
  replyTo: z.string().nullable(),
  subjectPrefix: z.string().nullable(),
  /** Header names only — values stay server-side when sensitive. */
  headerNames: z.array(z.string()).nullable(),
  templateConfigured: z.boolean(),
  templateMode: z.string().nullable(),
  templateSource: z.enum(["builtin", "custom"]).nullable(),
  /** Whether an optional signing secret is stored (value never returned). */
  signingConfigured: z.boolean(),
  /** Secret field paths that have values, for operator awareness without leaking them. */
  secretFieldPaths: z.array(z.string()),
  /** Feishu send mode; null for other destination kinds. */
  sendMode: z.enum(["webhook", "app"]).nullable(),
  /** Feishu app send mode: the registered app resource id. */
  appRef: z.string().nullable(),
  /** Feishu app send mode: the target group chat. */
  chatId: z.string().nullable(),
  /** Feishu urgent paging: whether automatic paging is enabled. */
  urgentAutoEnabled: z.boolean().nullable(),
  /** Feishu urgent paging: configured receiver ids (operational handles, not secrets). */
  urgentReceivers: z.array(z.string()).nullable(),
});

export type DestinationOperationalConfig = z.infer<typeof DestinationOperationalConfigSchema>;

/** @deprecated Use DestinationOperationalConfigSchema — kept as alias during migration. */
export const DestinationSafeConfigSchema = DestinationOperationalConfigSchema;
/** @deprecated Use DestinationOperationalConfig */
export type DestinationSafeConfig = DestinationOperationalConfig;

export const DestinationListItemSchema = DestinationSummarySchema.extend({
  operationalConfig: DestinationOperationalConfigSchema,
});

export type DestinationListItem = z.infer<typeof DestinationListItemSchema>;

export const DestinationDeleteResultSchema = z.object({
  id: z.string().min(1),
});

export type DestinationDeleteResult = z.infer<typeof DestinationDeleteResultSchema>;

export const TemplateDiagnosticSeveritySchema = z.enum(["error", "warning"]);

export const TemplateDiagnosticSchema = z.object({
  severity: TemplateDiagnosticSeveritySchema,
  path: z.string().optional(),
  variable: z.string().optional(),
  message: z.string(),
});

export type TemplateDiagnostic = z.infer<typeof TemplateDiagnosticSchema>;

export const DestinationTemplateContextSchema = z.object({
  event: z.object({
    id: z.string(),
    title: z.string(),
    message: z.string(),
    severity: z.string(),
    severityDisplay: z.string(),
    status: z.string(),
    statusDisplay: z.string(),
    fingerprint: z.string(),
    occurredAt: z.string(),
    occurredAtDisplay: z.string(),
    labels: z.record(z.string(), z.string()),
  }),
  source: z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
  }),
  destination: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.string(),
  }),
  presentation: z.object({
    locale: z.string(),
    timeZone: z.string(),
    labels: z.record(z.string(), z.string()),
  }),
  tocsin: z.object({
    eventUrl: z.string(),
  }),
  payload: JsonValueSchema,
  bindings: z.record(z.string(), z.string()),
});

export type DestinationTemplateContext = z.infer<typeof DestinationTemplateContextSchema>;

export const DestinationPreviewSampleSchema = z.object({
  kind: z.enum(["built_in", "historical_event"]),
  eventId: z.string().min(1),
  source: SourceSummarySchema,
  receivedAt: z.string().nullable(),
});

export type DestinationPreviewSample = z.infer<typeof DestinationPreviewSampleSchema>;

export const DestinationPreviewRawPayloadReferenceSchema = z.object({
  eventId: z.string().min(1),
  payload: JsonValueSchema,
  headers: z.record(z.string(), z.string()),
});

export type DestinationPreviewRawPayloadReference = z.infer<
  typeof DestinationPreviewRawPayloadReferenceSchema
>;

export const DestinationPreviewResultSchema = z.object({
  destination: DestinationSummarySchema,
  renderedPayload: JsonValueSchema,
  sample: DestinationPreviewSampleSchema,
  context: DestinationTemplateContextSchema,
  normalizedEvent: NormalizedEventSchema,
  diagnostics: z.array(TemplateDiagnosticSchema),
  rawPayloadReference: DestinationPreviewRawPayloadReferenceSchema.nullable(),
});

export type DestinationPreviewResult = z.infer<typeof DestinationPreviewResultSchema>;

export const DestinationTestResultSchema = z.object({
  destination: DestinationSummarySchema,
  success: z.boolean(),
  statusCode: z.number().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
  renderedPayload: JsonValueSchema,
});

export type DestinationTestResult = z.infer<typeof DestinationTestResultSchema>;

/**
 * Dashboard edit-form draft: operational fields are filled for self-hosted operators.
 * Signing secrets and sensitive header values are never returned.
 */
export const DestinationEditorFormDraftSchema = z.object({
  endpointUrl: z.string(),
  to: z.string(),
  from: z.string(),
  replyTo: z.string(),
  subjectPrefix: z.string(),
  /**
   * Email template slots that live next to `template` instead of being a
   * template mode. They are operator-authored content (not secrets), so the
   * edit form can round-trip them the same way it does `subjectPrefix`.
   */
  subjectTemplate: z.string(),
  htmlTemplate: z.string(),
  /** Header lines as `Name: value`; sensitive values become empty strings. */
  headers: z.string(),
  /**
   * The webhook address, whichever config key this kind stores it under
   * (`url` for generic webhook, `webhookUrl` for slack and feishu). The form has
   * a single input for it, so the draft has a single field.
   */
  webhookUrl: z.string(),
  method: z.string(),
  /** Feishu send mode and app-mode target fields. */
  sendMode: z.enum(["webhook", "app"]),
  appRef: z.string(),
  chatId: z.string(),
  /** Feishu urgent paging fields; receivers comma or newline separated. */
  urgentAutoEnabled: z.boolean(),
  urgentSeverities: z.array(z.string()),
  urgentUserIdType: z.string(),
  urgentReceivers: z.string(),
});

export type DestinationEditorFormDraft = z.infer<typeof DestinationEditorFormDraftSchema>;

export const DestinationEditorDraftResultSchema = z.object({
  destinationId: z.string().min(1),
  kind: DestinationKindSchema,
  template: JsonObjectSchema.nullable(),
  operationalConfig: DestinationOperationalConfigSchema,
  form: DestinationEditorFormDraftSchema,
});

export type DestinationEditorDraftResult = z.infer<typeof DestinationEditorDraftResultSchema>;
