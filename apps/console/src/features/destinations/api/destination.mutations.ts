import { useQueryClient } from "@tanstack/react-query";

import { destinationQueryKeys } from "#/features/destinations/api/destination.queries";
import { routeQueryKeys } from "#/features/routes/api/route.queries";
import { orpc } from "#/lib/orpc";

/**
 * Destinations mutation surface.
 * Components should call these hooks instead of importing server functions
 * directly, so invalidation and typed DTOs stay next to the Query layer.
 */
export function useDestinationMutations() {
  const queryClient = useQueryClient();

  return {
    createDestination: orpc.destinations.create.call,
    deleteDestination: orpc.destinations.delete.call,
    previewDeleteDestination: orpc.destinations.previewDelete.call,
    previewDestination: orpc.destinations.preview.call,
    previewDestinationDraft: orpc.destinations.previewDraft.call,
    previewDestinationUpdate: orpc.destinations.previewUpdate.call,
    testDestination: orpc.destinations.test.call,
    updateDestination: orpc.destinations.update.call,
    invalidateDestinations: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: destinationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: routeQueryKeys.all }),
      ]),
  };
}
