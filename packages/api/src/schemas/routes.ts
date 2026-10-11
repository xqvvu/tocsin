import { RouteDefinitionSchema } from "@tocsin/core";
import * as z from "zod";

import { IdOutputSchema } from "./shared";

export const RouteListOutputSchema = z.array(RouteDefinitionSchema);

export const RouteOutputSchema = RouteDefinitionSchema;

export const RouteDeleteOutputSchema = IdOutputSchema;
