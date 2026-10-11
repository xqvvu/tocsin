import { SourceSummarySchema } from "@tocsin/core";
import * as z from "zod";

import { IdOutputSchema } from "./shared";

export const SourceListOutputSchema = z.array(SourceSummarySchema);

export const SourceOutputSchema = SourceSummarySchema;

// Source detail plus its freshly generated intake token. The token is returned
// exactly once, at create or rotate time; only its hash is persisted.
export const SourceTokenOutputSchema = z.object({
  source: SourceSummarySchema,
  token: z.string().min(1),
});

export const SourceDeleteOutputSchema = IdOutputSchema;
