import { useQueryClient } from "@tanstack/react-query";

import { routeQueryKeys } from "#/features/routes/api/route.queries";
import { orpc } from "#/lib/orpc";

export function useRouteMutations() {
  const queryClient = useQueryClient();

  return {
    createRoute: orpc.routes.create.call,
    deleteRoute: orpc.routes.delete.call,
    previewDeleteRoute: orpc.routes.previewDelete.call,
    updateRoute: orpc.routes.update.call,
    invalidateRoutes: () =>
      queryClient.invalidateQueries({
        queryKey: routeQueryKeys.all,
      }),
  };
}
