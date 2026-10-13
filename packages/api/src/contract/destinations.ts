import { oc } from "@orpc/contract";
import {
  CreateDestinationCommandSchema,
  DeleteDestinationCommandSchema,
  GetDestinationTemplateDraftCommandSchema,
  PreviewDestinationCommandSchema,
  PreviewDestinationDraftCommandSchema,
  PreviewDestinationUpdateCommandSchema,
  TestDestinationCommandSchema,
  UpdateDestinationCommandSchema,
} from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { resourceErrors } from "../errors/resources";
import {
  DestinationCatalogOutputSchema,
  DestinationDeleteOutputSchema,
  DestinationListOutputSchema,
  DestinationOutputSchema,
  DestinationPreviewOutputSchema,
  DestinationTemplateDraftOutputSchema,
  DestinationTestOutputSchema,
} from "../schemas/destinations";

const dashboardErrors = dashboardAuth.error;
const resource = resourceErrors.error;

/**
 * Outbound destination administration.
 *
 * List and detail DTOs carry the operational fields an on-call operator needs
 * (endpoint, method, recipients, header names). Signing secrets, passwords, and
 * sensitive header values stay server-side.
 *
 * Every procedure that takes an id declares `NOT_FOUND`; the ones that validate
 * adapter config or referenced resources also declare `BAD_REQUEST`.
 */
export const destinations = {
  list: oc.errors(dashboardErrors).output(DestinationListOutputSchema),

  // Static adapter registry metadata; the service answers synchronously.
  listCatalog: oc.errors(dashboardErrors).output(DestinationCatalogOutputSchema),

  getTemplateDraft: oc
    .input(GetDestinationTemplateDraftCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationTemplateDraftOutputSchema),

  create: oc
    .input(CreateDestinationCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationOutputSchema),

  update: oc
    .input(UpdateDestinationCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationOutputSchema),

  delete: oc
    .input(DeleteDestinationCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationDeleteOutputSchema),

  test: oc
    .input(TestDestinationCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationTestOutputSchema),

  preview: oc
    .input(PreviewDestinationCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationPreviewOutputSchema),

  previewDraft: oc
    .input(PreviewDestinationDraftCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationPreviewOutputSchema),

  previewUpdate: oc
    .input(PreviewDestinationUpdateCommandSchema)
    .errors(dashboardErrors)
    .errors(resource)
    .output(DestinationPreviewOutputSchema),
};
