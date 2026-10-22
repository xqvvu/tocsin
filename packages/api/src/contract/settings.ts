import { oc } from "@orpc/contract";
import { UpdateAppSettingsCommandSchema } from "@tocsin/core";

import { dashboardAuth } from "../errors/dashboard-auth";
import {
  AppSettingsOutputSchema,
  RuntimeInformationOutputSchema,
  StorageHealthOutputSchema,
  WorkerHealthOutputSchema,
} from "../schemas/settings";

const dashboardErrors = dashboardAuth.error;

/** Console runtime settings (locale, time zone, retention). */
export const settings = {
  get: oc.errors(dashboardErrors).output(AppSettingsOutputSchema),

  /** Read-only process and effective-limit projection for operators. */
  getRuntime: oc.errors(dashboardErrors).output(RuntimeInformationOutputSchema),

  /** Read-only SQLite size and row-count projection for operators. */
  getStorageHealth: oc.errors(dashboardErrors).output(StorageHealthOutputSchema),

  /**
   * Read-only background worker health. Observes runners that are already
   * assembled; it never starts one.
   */
  getWorkerHealth: oc.errors(dashboardErrors).output(WorkerHealthOutputSchema),

  update: oc
    .input(UpdateAppSettingsCommandSchema)
    .errors(dashboardErrors)
    .output(AppSettingsOutputSchema),
};
