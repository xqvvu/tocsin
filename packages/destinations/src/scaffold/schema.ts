import { z } from "zod";

import { TextOnlyDestinationTemplateSchema } from "#destinations/template";

/**
 * The adapter's typed config. Keep it strict: the console parses every saved
 * config (and every TOML import) through this schema, so an unknown key fails
 * loudly instead of being silently carried as dead data.
 */
export const GenericWebhookConfigSchema = z.strictObject({
  webhookUrl: z.url(),
  template: TextOnlyDestinationTemplateSchema.optional(),
});

export type GenericWebhookConfig = z.infer<typeof GenericWebhookConfigSchema>;
