import { z } from "zod";

import {
  JsonPayloadDestinationTemplateSchema,
  TextOnlyDestinationTemplateSchema,
} from "#destinations/template";

// Generic webhook accepts a plain text template (fills the default envelope's
// message field) or a full JSON payload template that replaces the envelope.
export const GenericWebhookTemplateSchema = z.union([
  TextOnlyDestinationTemplateSchema,
  JsonPayloadDestinationTemplateSchema,
]);

export const GenericWebhookConfigSchema = z.strictObject({
  url: z.url(),
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  headers: z.record(z.string(), z.string()).default({}),
  template: GenericWebhookTemplateSchema.optional(),
});

export type GenericWebhookConfig = z.infer<typeof GenericWebhookConfigSchema>;
