import { z } from "zod";

import { DestinationKindSchema } from "#core/destination/destination";
import { AlertStatusSchema, IsoDateTimeSchema } from "#core/event/normalized-event";
import { JsonObjectSchema } from "#core/json";
import { IanaTimeZoneSchema, LocaleSchema } from "#core/presentation";
import { RouteDefinitionSchema } from "#core/route/route";
import { SourceProviderSchema } from "#core/source/source";
import { SuppressionKindSchema, SuppressionMatcherSchema } from "#core/suppression/suppression";

export const CreateSourceCommandSchema = z.object({
  name: z.string().trim().min(1),
  provider: SourceProviderSchema,
  enabled: z.boolean().default(true),
  config: JsonObjectSchema.default({}),
});

export const UpdateSourceCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  provider: SourceProviderSchema.optional(),
  enabled: z.boolean().optional(),
  config: JsonObjectSchema.optional(),
});

export const RotateSourceTokenCommandSchema = z.object({
  id: z.string().min(1),
});

export const DeleteSourceCommandSchema = z.object({
  id: z.string().min(1),
});

export const CreateFeishuAppCommandSchema = z.object({
  name: z.string().trim().min(1),
  appId: z.string().trim().min(1),
  appSecret: z.string().min(1),
});

export const UpdateFeishuAppCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  appId: z.string().trim().min(1).optional(),
  appSecret: z.string().min(1).optional(),
});

export const DeleteFeishuAppCommandSchema = z.object({
  id: z.string().min(1),
});

export const TestFeishuAppCommandSchema = z.object({
  id: z.string().min(1),
});

export const CreateDestinationCommandSchema = z.object({
  name: z.string().trim().min(1),
  kind: DestinationKindSchema,
  enabled: z.boolean().default(true),
  config: JsonObjectSchema.default({}),
  secretRefs: JsonObjectSchema.default({}),
});

export const UpdateDestinationCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  kind: DestinationKindSchema.optional(),
  enabled: z.boolean().optional(),
  config: JsonObjectSchema.optional(),
  secretRefs: JsonObjectSchema.optional(),
});

export const TestDestinationCommandSchema = z.object({
  id: z.string().min(1),
  /**
   * Render and send the test with a stored Event instead of the built-in
   * sample. Omitted keeps the synthetic event so existing callers are
   * unchanged.
   */
  sampleEventId: z.string().min(1).optional(),
});

export const GetDestinationTemplateDraftCommandSchema = z.object({
  id: z.string().min(1),
});

export const PreviewDestinationCommandSchema = z.object({
  id: z.string().min(1),
  sampleEventId: z.string().min(1).optional(),
  sampleStatus: AlertStatusSchema.optional(),
});

export const PreviewDestinationDraftCommandSchema = z.object({
  name: z.string().trim().min(1),
  kind: DestinationKindSchema,
  config: JsonObjectSchema.default({}),
  sampleEventId: z.string().min(1).optional(),
  sampleStatus: AlertStatusSchema.optional(),
});

export const PreviewDestinationUpdateCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  config: JsonObjectSchema.default({}),
  sampleEventId: z.string().min(1).optional(),
  sampleStatus: AlertStatusSchema.optional(),
});

export const DeleteDestinationCommandSchema = z.object({
  id: z.string().min(1),
});

export const ExportConfigurationCommandSchema = z
  .object({
    // Still only `false`, and still deliberately not a boolean: `true` must be
    // unrepresentable so "include secrets" cannot be requested at all. A JSON
    // body carries a real `false`, so no string spelling is needed.
    includeSecrets: z.literal(false).optional(),
  })
  .default({});

export const ImportConfigurationCommandSchema = z.object({
  toml: z.string().min(1),
});

export const ImportConfigurationJsonCommandSchema = z.object({
  json: z.string().min(1),
});

export const UpdateAppSettingsCommandSchema = z.object({
  locale: LocaleSchema.optional(),
  timeZone: IanaTimeZoneSchema.optional(),
  rawPayloadRetentionDays: z.number().int().min(0).max(3650),
  /**
   * Emergency stop for outbound delivery. Omitted keeps the current state so
   * unrelated settings edits cannot accidentally resume a paused instance.
   */
  deliveryPaused: z.boolean().optional(),
});

export const CreateRouteCommandSchema = z.object({
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  rule: RouteDefinitionSchema.shape.rule.optional(),
  destinationIds: RouteDefinitionSchema.shape.destinationIds,
});

export const UpdateRouteCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  rule: RouteDefinitionSchema.shape.rule.optional(),
  destinationIds: RouteDefinitionSchema.shape.destinationIds.optional(),
});

export const DeleteRouteCommandSchema = z.object({
  id: z.string().min(1),
});

export const CreateSuppressionCommandSchema = z.object({
  name: z.string().trim().min(1),
  kind: SuppressionKindSchema,
  enabled: z.boolean().default(true),
  reason: z.string().trim().min(1).nullable().default(null),
  /**
   * A completely empty matcher is legal (silence everything in the window) but
   * dangerous; the UI confirms it before calling this. The command does not
   * reject it, because "silence everything during a migration" is a real intent.
   * Omitting the matcher means the same thing as `{}`.
   */
  matcher: SuppressionMatcherSchema.optional(),
  /** Omitted means "starts now", which the repository applies. */
  startsAt: IsoDateTimeSchema.optional(),
  /** Required by owner ruling (2026-10-12): silence always self-heals. */
  endsAt: IsoDateTimeSchema,
});

export const UpdateSuppressionCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  kind: SuppressionKindSchema.optional(),
  enabled: z.boolean().optional(),
  reason: z.string().trim().min(1).nullable().optional(),
  matcher: SuppressionMatcherSchema.optional(),
  startsAt: IsoDateTimeSchema.optional(),
  endsAt: IsoDateTimeSchema.optional(),
});

export const DeleteSuppressionCommandSchema = z.object({
  id: z.string().min(1),
});

export const SetSuppressionEnabledCommandSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export type CreateSourceCommand = z.input<typeof CreateSourceCommandSchema>;
export type UpdateSourceCommand = z.input<typeof UpdateSourceCommandSchema>;
export type RotateSourceTokenCommand = z.input<typeof RotateSourceTokenCommandSchema>;
export type DeleteSourceCommand = z.input<typeof DeleteSourceCommandSchema>;
export type CreateFeishuAppCommand = z.input<typeof CreateFeishuAppCommandSchema>;
export type UpdateFeishuAppCommand = z.input<typeof UpdateFeishuAppCommandSchema>;
export type DeleteFeishuAppCommand = z.input<typeof DeleteFeishuAppCommandSchema>;
export type TestFeishuAppCommand = z.input<typeof TestFeishuAppCommandSchema>;
export type CreateDestinationCommand = z.input<typeof CreateDestinationCommandSchema>;
export type UpdateDestinationCommand = z.input<typeof UpdateDestinationCommandSchema>;
export type TestDestinationCommand = z.input<typeof TestDestinationCommandSchema>;
export type GetDestinationTemplateDraftCommand = z.input<
  typeof GetDestinationTemplateDraftCommandSchema
>;
export type PreviewDestinationCommand = z.input<typeof PreviewDestinationCommandSchema>;
export type PreviewDestinationDraftCommand = z.input<typeof PreviewDestinationDraftCommandSchema>;
export type PreviewDestinationUpdateCommand = z.input<typeof PreviewDestinationUpdateCommandSchema>;
export type DeleteDestinationCommand = z.input<typeof DeleteDestinationCommandSchema>;
export type ExportConfigurationCommand = z.input<typeof ExportConfigurationCommandSchema>;
export type ImportConfigurationCommand = z.input<typeof ImportConfigurationCommandSchema>;
export type ImportConfigurationJsonCommand = z.input<typeof ImportConfigurationJsonCommandSchema>;
export type UpdateAppSettingsCommand = z.input<typeof UpdateAppSettingsCommandSchema>;
export type CreateRouteCommand = z.input<typeof CreateRouteCommandSchema>;
export type UpdateRouteCommand = z.input<typeof UpdateRouteCommandSchema>;
export type DeleteRouteCommand = z.input<typeof DeleteRouteCommandSchema>;
export type CreateSuppressionCommand = z.input<typeof CreateSuppressionCommandSchema>;
export type UpdateSuppressionCommand = z.input<typeof UpdateSuppressionCommandSchema>;
export type DeleteSuppressionCommand = z.input<typeof DeleteSuppressionCommandSchema>;
export type SetSuppressionEnabledCommand = z.input<typeof SetSuppressionEnabledCommandSchema>;
