// @vitest-environment jsdom

import { describe, expect, it, vi } from "vite-plus/test";

// The real helper imports the oRPC client, whose server half reaches the
// router. This test only exercises the filter normalization at the client
// boundary, so the stub hands the options straight back.
vi.mock("#/lib/orpc", () => ({
  orpc: {
    operations: {
      list: {
        queryOptions: (options: { input: Record<string, unknown>; queryKey: readonly unknown[] }) =>
          options,
      },
    },
  },
}));

import {
  operationsQueryKeys,
  operationsQueryOptions,
} from "#/features/operations/api/operations.queries";

/** What the stub above returns; the real type hides `input` behind the wrapper. */
interface StubbedQueryOptions {
  input: Record<string, unknown>;
  queryKey: readonly unknown[];
}

function stubbedOptions(filters: Parameters<typeof operationsQueryOptions>[0]) {
  return operationsQueryOptions(filters) as unknown as StubbedQueryOptions;
}

describe("operations query options", () => {
  it("sends the exact fingerprint and keys the cache by it", () => {
    const options = stubbedOptions({ fingerprint: "checkout:unavailable" });

    // Regression guard: the normalization whitelist used to drop new filters.
    // The request then arrived without the value while the chip still claimed
    // the list was filtered, so the page showed every event.
    expect(options.input).toMatchObject({ fingerprint: "checkout:unavailable" });
    expect(JSON.stringify(options.queryKey)).toContain('"fingerprint":"checkout:unavailable"');
  });

  it("keeps the fingerprint out of the request when it is empty", () => {
    const options = stubbedOptions({ fingerprint: "" });

    expect(options.input).not.toHaveProperty("fingerprint");
  });

  it("keys different fingerprints apart", () => {
    const first = operationsQueryKeys.list({ fingerprint: "checkout:unavailable" });
    const second = operationsQueryKeys.list({ fingerprint: "checkout:unavailable:eu" });

    expect(first).not.toEqual(second);
  });
});
