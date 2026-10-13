import { orpc } from "#/lib/orpc";

export const suppressionQueryKeys = {
  all: ["suppressions"] as const,
  list: () => [...suppressionQueryKeys.all, "list"] as const,
  detail: (id: string) => [...suppressionQueryKeys.all, "detail", id] as const,
  hits: (id: string, page: number) => [...suppressionQueryKeys.detail(id), "hits", page] as const,
};

export function suppressionsQueryOptions() {
  return orpc.suppressions.list.queryOptions({
    queryKey: suppressionQueryKeys.list(),
  });
}

export function suppressionQueryOptions(id: string) {
  return orpc.suppressions.get.queryOptions({
    input: { id },
    queryKey: suppressionQueryKeys.detail(id),
  });
}

export function suppressionHitsQueryOptions(id: string, page = 1) {
  return orpc.suppressions.hits.queryOptions({
    input: { id, page, limit: 20 },
    queryKey: suppressionQueryKeys.hits(id, page),
  });
}
