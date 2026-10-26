import { useQueryClient } from "@tanstack/react-query";

import { routeQueryKeys } from "#/features/routes/api/route.queries";
import { sourceQueryKeys } from "#/features/sources/api/source.queries";
import { orpc } from "#/lib/orpc";

export function useSourceMutations() {
  const queryClient = useQueryClient();

  return {
    createSource: orpc.sources.create.call,
    deleteSource: orpc.sources.delete.call,
    previewDeleteSource: orpc.sources.previewDelete.call,
    updateSource: orpc.sources.update.call,
    rotateSourceToken: orpc.sources.rotateToken.call,
    invalidateSources: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: routeQueryKeys.all }),
      ]),
  };
}
