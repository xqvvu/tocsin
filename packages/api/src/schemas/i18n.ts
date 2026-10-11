import { LocaleSchema } from "@tocsin/core";
import * as z from "zod";

/** Locale and time zone resolved for the current request. */
export const RequestLocaleOutputSchema = z.object({
  locale: LocaleSchema,
  timeZone: z.string().min(1),
});
