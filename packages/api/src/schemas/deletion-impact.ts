import { DeletionImpactSchema } from "@tocsin/core";

/**
 * Read-only preview of the history a configuration delete cascades to.
 *
 * Sources, routes, and destinations share the shape so the console can render
 * one disclosure component; the counts themselves stay entity-specific on the
 * server (see `countDeletionImpact` in the history repository).
 */
export const DeletionImpactOutputSchema = DeletionImpactSchema;
