import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createQueryClient, DEFAULT_QUERY_STALE_TIME } from "#/lib/query-client";

describe("createQueryClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps loader-prefetched data fresh inside the default window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
    const queryClient = createQueryClient();

    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);

    queryClient.setQueryData(["operations", "list"], { total: 1 });
    const query = queryClient.getQueryCache().find({ queryKey: ["operations", "list"] });

    expect(query?.isStaleByTime(DEFAULT_QUERY_STALE_TIME)).toBe(false);
    vi.advanceTimersByTime(DEFAULT_QUERY_STALE_TIME - 1);
    expect(query?.isStaleByTime(DEFAULT_QUERY_STALE_TIME)).toBe(false);
    vi.advanceTimersByTime(2);
    expect(query?.isStaleByTime(DEFAULT_QUERY_STALE_TIME)).toBe(true);
  });

  it("still reports data stale after a mutation invalidates its query key", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(["operations", "list"], { total: 1 });

    await queryClient.invalidateQueries({ queryKey: ["operations", "list"] });

    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: ["operations", "list"] })
        ?.isStale(),
    ).toBe(true);
  });
});
