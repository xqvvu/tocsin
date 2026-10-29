import { orpc } from "#/lib/orpc";

/**
 * Destinations client data surface.
 * Route loaders and UI should prefer these queryOptions over calling server
 * functions directly, so cache keys and DTO types stay centralized.
 */
export const destinationQueryKeys = {
  all: ["destinations"] as const,
  list: () => [...destinationQueryKeys.all, "list"] as const,
  templateDraft: (id: string) => [...destinationQueryKeys.all, "detail", id, "template"] as const,
};

export function destinationsQueryOptions() {
  return orpc.destinations.list.queryOptions({
    queryKey: destinationQueryKeys.list(),
  });
}

export function destinationTemplateDraftQueryOptions(id: string) {
  return orpc.destinations.getTemplateDraft.queryOptions({
    input: { id },
    queryKey: destinationQueryKeys.templateDraft(id),
  });
}

export function destinationEnablePreviewQueryOptions(id: string) {
  return orpc.destinations.previewEnable.queryOptions({
    input: { id },
    queryKey: [...destinationQueryKeys.all, "detail", id, "enable-preview"] as const,
    // The count answers "what starts ringing if I flip this switch now". A
    // cached answer from the last time the dialog opened would be stale by
    // definition, so drop it as soon as the confirmation closes.
    gcTime: 0,
  });
}

export const destinationCatalogQueryKeys = {
  all: ["destination-catalog"] as const,
  list: () => [...destinationCatalogQueryKeys.all, "list"] as const,
};

export function destinationCatalogQueryOptions() {
  return orpc.destinations.listCatalog.queryOptions({
    queryKey: destinationCatalogQueryKeys.list(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
