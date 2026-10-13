import * as z from "zod";

export type { NumberedPage } from "@tocsin/core";

/** Result of a delete-style command: the identifier that was removed. */
export const IdOutputSchema = z.object({
  id: z.string().min(1),
});

/** Schema mirror of the `NumberedPage<T>` page type in `@tocsin/core`. */
export function NumberedPageSchema<const T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(0),
  });
}
