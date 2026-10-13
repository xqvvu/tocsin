import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
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
  list: oc
    .meta(openapi({ method: "GET" }))
    .errors(dashboardErrors)
    .output(SuppressionListOutputSchema),

  get: oc
    .meta(openapi({ method: "GET" }))
    .input(SuppressionDetailInputSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  // The blast radius of one rule: the deliveries it silenced. Kept as its own
  // paged procedure so the detail view can page through hits without refetching
  // the rule.
  hits: oc
    .meta(openapi({ method: "GET" }))
    .input(SuppressionHitsInputSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionHitsOutputSchema),

  create: oc
    .meta(openapi({ method: "POST" }))
    .input(CreateSuppressionCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  update: oc
    .meta(openapi({ method: "POST" }))
    .input(UpdateSuppressionCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  setEnabled: oc
    .meta(openapi({ method: "POST" }))
    .input(SetSuppressionEnabledCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionOutputSchema),

  delete: oc
    .meta(openapi({ method: "POST" }))
    .input(DeleteSuppressionCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SuppressionDeleteOutputSchema),
};
