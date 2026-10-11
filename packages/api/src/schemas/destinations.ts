import {
  AdapterCatalogBaseSchema,
  DestinationDeleteResultSchema,
  DestinationEditorDraftResultSchema,
  DestinationKindSchema,
  DestinationListItemSchema,
  DestinationPreviewResultSchema,
  DestinationTestResultSchema,
} from "@tocsin/core";
import * as z from "zod";

export const DestinationListOutputSchema = z.array(DestinationListItemSchema);

export const DestinationOutputSchema = DestinationListItemSchema;

export const DestinationDeleteOutputSchema = DestinationDeleteResultSchema;

export const DestinationTemplateDraftOutputSchema = DestinationEditorDraftResultSchema;

export const DestinationTestOutputSchema = DestinationTestResultSchema;

export const DestinationPreviewOutputSchema = DestinationPreviewResultSchema;

// Adapter capabilities for the console. Declared here rather than imported from
// "@tocsin/destinations" so the API package keeps no adapter dependency.
export const DestinationCapabilitiesSchema = z.strictObject({
  preview: z.boolean(),
  test: z.boolean(),
  delivery: z.boolean(),
});

export const DestinationCatalogItemSchema = AdapterCatalogBaseSchema.extend({
  kind: DestinationKindSchema,
  capabilities: DestinationCapabilitiesSchema,
});

export const DestinationCatalogOutputSchema = z.array(DestinationCatalogItemSchema);
