import { IanaTimeZoneSchema, LocaleSchema } from "@tocsin/core";
import * as z from "zod";

/** Console runtime settings owned by the dashboard operator. */
export const AppSettingsOutputSchema = z.object({
  locale: LocaleSchema,
  timeZone: IanaTimeZoneSchema,
  rawPayloadRetentionDays: z.number().int().min(0),
});
