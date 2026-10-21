import { orpc } from "#/lib/orpc";

export const appSettingsQueryKeys = {
  all: ["app-settings"] as const,
  detail: () => [...appSettingsQueryKeys.all, "detail"] as const,
};

export function appSettingsQueryOptions() {
  return orpc.settings.get.queryOptions({
    queryKey: appSettingsQueryKeys.detail(),
  });
}

export const runtimeInformationQueryKeys = {
  all: ["runtime-information"] as const,
  detail: () => [...runtimeInformationQueryKeys.all, "detail"] as const,
};

export function runtimeInformationQueryOptions() {
  return orpc.settings.getRuntime.queryOptions({
    queryKey: runtimeInformationQueryKeys.detail(),
  });
}
