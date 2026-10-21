import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { UpdateAppSettingsCommand } from "@tocsin/core";

import { appSettingsQueryKeys } from "#/features/configuration/api/configuration.queries";
import { i18nQueryKeys } from "#/i18n/i18n.queries";
import { orpc } from "#/lib/orpc";

export function useAppSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateAppSettingsCommand) => orpc.settings.update.call(input),
    onSuccess: async (settings) => {
      queryClient.setQueryData(appSettingsQueryKeys.detail(), settings);
      await queryClient.invalidateQueries({ queryKey: i18nQueryKeys.all });
    },
  });
}
