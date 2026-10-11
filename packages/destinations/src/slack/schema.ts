import { z } from "zod";

import {
  SlackBlocksDestinationTemplateSchema,
  TextOnlyDestinationTemplateSchema,
} from "#destinations/template";

// Slack accepts a plain text template (fills the default message body) or a
// full block template that replaces the default blocks payload.
export const SlackTemplateSchema = z.union([
  TextOnlyDestinationTemplateSchema,
  SlackBlocksDestinationTemplateSchema,
]);

export const SlackConfigSchema = z.strictObject({
  webhookUrl: z.url(),
  template: SlackTemplateSchema.optional(),
});

export type SlackConfig = z.infer<typeof SlackConfigSchema>;
