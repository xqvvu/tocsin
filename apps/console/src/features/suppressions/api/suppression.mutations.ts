import { useQueryClient } from "@tanstack/react-query";

import { suppressionQueryKeys } from "#/features/suppressions/api/suppression.queries";
import { orpc } from "#/lib/orpc";

export function useSuppressionMutations() {
  const queryClient = useQueryClient();

  return {
    createSuppression: orpc.suppressions.create.call,
    updateSuppression: orpc.suppressions.update.call,
    setSuppressionEnabled: orpc.suppressions.setEnabled.call,
    deleteSuppression: orpc.suppressions.delete.call,
    invalidateSuppressions: () =>
      queryClient.invalidateQueries({
        queryKey: suppressionQueryKeys.all,
      }),
  };
}
