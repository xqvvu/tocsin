import { oc } from "@orpc/contract";
import {
  CreateFeishuAppCommandSchema,
  DeleteFeishuAppCommandSchema,
  TestFeishuAppCommandSchema,
  UpdateFeishuAppCommandSchema,
} from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { resourceErrors } from "../errors/resources";
import {
  FeishuAppDeleteOutputSchema,
  FeishuAppListOutputSchema,
  FeishuAppOutputSchema,
  FeishuAppTestOutputSchema,
} from "../schemas/integrations";

const dashboardErrors = dashboardAuth.error;

/**
 * Feishu app (飞书应用) administration.
 *
 * Apps are a reusable credential resource: registered once, referenced by
 * app-mode Feishu destinations, and protected from deletion while referenced.
 * Every procedure requires a dashboard session, and the app secret is never
 * returned to the client — the list DTO carries only the app id and the
 * destinations that reference it.
 *
 * `testFeishuApp` exchanges the credential for a `tenant_access_token` on the
 * server, so an operator can validate a saved app without sending anything.
 */
export const integrations = {
  listFeishuApps: oc.errors(dashboardErrors).output(FeishuAppListOutputSchema),

  createFeishuApp: oc
    .input(CreateFeishuAppCommandSchema)
    .errors(dashboardErrors)
    .output(FeishuAppOutputSchema),

  updateFeishuApp: oc
    .input(UpdateFeishuAppCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(FeishuAppOutputSchema),

  // Refuses with BAD_REQUEST when a destination still references the app; the
  // message lists the referencing destinations.
  deleteFeishuApp: oc
    .input(DeleteFeishuAppCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(FeishuAppDeleteOutputSchema),

  testFeishuApp: oc
    .input(TestFeishuAppCommandSchema)
    .errors(dashboardErrors)
    .errors(resourceErrors.error)
    .output(FeishuAppTestOutputSchema),
};
