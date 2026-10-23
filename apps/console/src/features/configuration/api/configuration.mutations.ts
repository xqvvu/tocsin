import { useQueryClient } from "@tanstack/react-query";

import { configurationReadOnlyQueryKeys } from "#/features/configuration/api/configuration-invalidation";
import { orpc } from "#/lib/orpc";

export function useConfigurationMutations() {
  const queryClient = useQueryClient();

  return {
    exportConfigurationJson: orpc.portability.exportJson.call,
    exportConfigurationToml: orpc.portability.exportToml.call,
    importConfigurationJson: orpc.portability.importJson.call,
    importConfigurationToml: orpc.portability.importToml.call,
    invalidateConfiguration: () =>
      Promise.all(
        configurationReadOnlyQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  };
}
