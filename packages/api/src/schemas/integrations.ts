import {
  FeishuAppListItemSchema,
  FeishuAppSummarySchema,
  FeishuAppTestResultSchema,
} from "@tocsin/core";
import * as z from "zod";

import { IdOutputSchema } from "./shared";

export const FeishuAppListOutputSchema = z.array(FeishuAppListItemSchema);

export const FeishuAppOutputSchema = FeishuAppSummarySchema;

export const FeishuAppTestOutputSchema = FeishuAppTestResultSchema;

export const FeishuAppDeleteOutputSchema = IdOutputSchema;
