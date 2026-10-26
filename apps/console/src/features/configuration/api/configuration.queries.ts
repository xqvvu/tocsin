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

export const storageHealthQueryKeys = {
  all: ["storage-health"] as const,
  detail: () => [...storageHealthQueryKeys.all, "detail"] as const,
};

export function storageHealthQueryOptions() {
  return orpc.settings.getStorageHealth.queryOptions({
    queryKey: storageHealthQueryKeys.detail(),
  });
}

export const workerHealthQueryKeys = {
  all: ["worker-health"] as const,
  detail: () => [...workerHealthQueryKeys.all, "detail"] as const,
};

export function workerHealthQueryOptions() {
  return orpc.settings.getWorkerHealth.queryOptions({
    queryKey: workerHealthQueryKeys.detail(),
  });
}

export const activeSessionsQueryKeys = {
  all: ["active-sessions"] as const,
  detail: () => [...activeSessionsQueryKeys.all, "detail"] as const,
};

export function activeSessionsQueryOptions() {
  return orpc.session.listActiveSessions.queryOptions({
    queryKey: activeSessionsQueryKeys.detail(),
  });
}
