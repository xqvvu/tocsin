import { oc } from "@orpc/contract";
import {
  CreateSuppressionCommandSchema,
  DeleteSuppressionCommandSchema,
  SetSuppressionEnabledCommandSchema,
  UpdateSuppressionCommandSchema,
} from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { resourceErrors } from "../errors/resources";
import {
  SuppressionDeleteOutputSchema,
  SuppressionDetailInputSchema,
  SuppressionHitsInputSchema,
  SuppressionHitsOutputSchema,
  SuppressionImpactOutputSchema,
  SuppressionListOutputSchema,
  SuppressionOutputSchema,
} from "../schemas/suppressions";

const dashboardErrors = dashboardAuth.error;

/**
 * Suppression rule administration.
 *
 * Writes declare `NOT_FOUND` and `BAD_REQUEST`: the repository raises
 * `RecordNotFoundError` for a missing rule, and the service rejects rules that
 * reference unknown source or destination ids or an inverted time window.
 */
export const suppressions = {
  list: oc.errors(dashboardErrors).output(SuppressionListOutputSchema),

  get: oc
    .input(SuppressionDetailInputSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  // The blast radius of one rule: the deliveries it silenced. Kept as its own
  // paged procedure so the detail view can page through hits without refetching
  // the rule.
  hits: oc
    .input(SuppressionHitsInputSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionHitsOutputSchema),

  // The same blast radius as `hits`, aggregated instead of paged: how many
  // alerts, sources, and destinations one rule's window actually covered.
  impact: oc
    .input(SuppressionDetailInputSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionImpactOutputSchema),

  create: oc
    .input(CreateSuppressionCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  update: oc
    .input(UpdateSuppressionCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  setEnabled: oc
    .input(SetSuppressionEnabledCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  delete: oc
    .input(DeleteSuppressionCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionDeleteOutputSchema),
};
