import { oc } from "@orpc/contract";
import { UpdateAppSettingsCommandSchema } from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import { AppSettingsOutputSchema, RuntimeInformationOutputSchema } from "../schemas/settings";

const dashboardErrors = dashboardAuth.error;

/** Console runtime settings (locale, time zone, retention). */
export const settings = {
  get: oc.errors(dashboardErrors).output(AppSettingsOutputSchema),

  /** Read-only process and effective-limit projection for operators. */
  getRuntime: oc.errors(dashboardErrors).output(RuntimeInformationOutputSchema),

  update: oc
    .input(UpdateAppSettingsCommandSchema)
    .errors(dashboardErrors)
    .output(AppSettingsOutputSchema),
};
