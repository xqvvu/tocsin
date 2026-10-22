import { QueryClient } from "@tanstack/react-query";

/**
 * How long loader-prefetched server state stays authoritative after hydration.
 *
 * Route loaders fill the cache during SSR. With TanStack Query's zero default,
 * the hydrated data is stale the moment a component mounts, so every list page
 * repeats its query (including the count aggregate) right after hydration.
 * Fifteen seconds covers the first operator interaction while still letting a
 * revisit pick up worker progress; mutations invalidate their own query keys,
 * so writes are not delayed by this window.
 */
export const DEFAULT_QUERY_STALE_TIME = 15_000;

/** Creates the per-request client used by both SSR and the browser. */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_QUERY_STALE_TIME,
      },
    },
  });
}
