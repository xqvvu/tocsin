import {
  activeSessionsQueryKeys,
  appSettingsQueryKeys,
  runtimeInformationQueryKeys,
  storageHealthQueryKeys,
  workerHealthQueryKeys,
} from "#/features/configuration/api/configuration.queries";
import { destinationQueryKeys } from "#/features/destinations/api/destination.queries";
import { routeQueryKeys } from "#/features/routes/api/route.queries";
import { sourceQueryKeys } from "#/features/sources/api/source.queries";

/**
 * Read-only projections that a settings change or a configuration import can
 * make stale. Every projection rendered by the Settings workspace, or replaced
 * wholesale by a configuration import, must be registered here. The invalidation
 * contract test fails when a configuration query key is missing.
 */
export const configurationReadOnlyQueryKeys = [
  appSettingsQueryKeys.all,
  runtimeInformationQueryKeys.all,
  storageHealthQueryKeys.all,
  workerHealthQueryKeys.all,
  activeSessionsQueryKeys.all,
  sourceQueryKeys.all,
  destinationQueryKeys.all,
  routeQueryKeys.all,
] as const;
