import { useQueryClient } from "@tanstack/react-query";

import {
  appSettingsQueryKeys,
  runtimeInformationQueryKeys,
} from "#/features/configuration/api/configuration.queries";
import { destinationQueryKeys } from "#/features/destinations/api/destination.queries";
import { routeQueryKeys } from "#/features/routes/api/route.queries";
import { sourceQueryKeys } from "#/features/sources/api/source.queries";
import { orpc } from "#/lib/orpc";

export function useConfigurationMutations() {
  const queryClient = useQueryClient();

  return {
    exportConfigurationJson: orpc.portability.exportJson.call,
    exportConfigurationToml: orpc.portability.exportToml.call,
    importConfigurationJson: orpc.portability.importJson.call,
    importConfigurationToml: orpc.portability.importToml.call,
    invalidateConfiguration: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: appSettingsQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: runtimeInformationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: sourceQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: destinationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: routeQueryKeys.all }),
      ]),
  };
}
