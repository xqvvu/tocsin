import { useMutation, useQueryClient } from "@tanstack/react-query";

import { activeSessionsQueryKeys } from "#/features/configuration/api/configuration.queries";
import { orpc } from "#/lib/orpc";

/**
 * Account-session actions.
 *
 * Only the whole-account "sign out other devices" action exists: the server
 * takes the caller from the request cookie, so there is no session id to pass
 * and no cross-account path to guard on the client.
 */
export function useSessionMutations() {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => orpc.session.revokeOtherSessions.call(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activeSessionsQueryKeys.all }),
  });

  return {
    revoking: revoke.isPending,
    revokeOtherSessions: () => revoke.mutateAsync(),
  };
}
