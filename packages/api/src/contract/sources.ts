import { oc } from "@orpc/contract";
import {
  CreateSourceCommandSchema,
  DeleteSourceCommandSchema,
  RotateSourceTokenCommandSchema,
  UpdateSourceCommandSchema,
} from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { resourceErrors } from "../errors/resources";
import { DeletionImpactOutputSchema } from "../schemas/deletion-impact";
import {
  SourceDeleteOutputSchema,
  SourceListOutputSchema,
  SourceOutputSchema,
  SourceTokenOutputSchema,
} from "../schemas/sources";

const dashboardErrors = dashboardAuth.error;

/**
 * Alert source (告警源) administration.
 *
 * Every procedure requires a dashboard session; webhook intake authenticates
 * with a Source token on `/api/sources/$sourceId/webhook` instead and never
 * reaches these procedures.
 *
 * Mutations declare `NOT_FOUND` because the source repository raises
 * `RecordNotFoundError` when the target row is gone.
 */
export const sources = {
  list: oc.errors(dashboardErrors).output(SourceListOutputSchema),

  create: oc
    .input(CreateSourceCommandSchema)
    .errors(dashboardErrors)
    .output(SourceTokenOutputSchema),

  update: oc
    .input(UpdateSourceCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SourceOutputSchema),

  // Returns the new intake token exactly once; only its hash is persisted.
  rotateToken: oc
    .input(RotateSourceTokenCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SourceTokenOutputSchema),

  // Read-only disclosure of the history the delete cascades to. The console
  // calls it when the confirmation dialog opens, never as part of the delete.
  previewDelete: oc
    .input(DeleteSourceCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(DeletionImpactOutputSchema),

  delete: oc
    .input(DeleteSourceCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(SourceDeleteOutputSchema),
};
