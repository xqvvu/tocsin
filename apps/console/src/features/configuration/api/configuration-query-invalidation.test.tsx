// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { configurationReadOnlyQueryKeys } from "#/features/configuration/api/configuration-invalidation";
import { useConfigurationMutations } from "#/features/configuration/api/configuration.mutations";
import * as configurationQueries from "#/features/configuration/api/configuration.queries";
import { useDestinationMutations } from "#/features/destinations/api/destination.mutations";
import { useRouteMutations } from "#/features/routes/api/route.mutations";
import { useSourceMutations } from "#/features/sources/api/source.mutations";

type QueryKeyDefinition = { all: readonly string[] };

function isQueryKeyDefinition(value: unknown): value is QueryKeyDefinition {
  return typeof value === "object" && value !== null && "all" in value && Array.isArray(value.all);
}

const testState = vi.hoisted(() => ({
  invalidateQueries: vi.fn<(input: { queryKey: readonly string[] }) => Promise<void>>(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: testState.invalidateQueries }),
}));

vi.mock("#/lib/orpc", () => {
  const call = vi.fn<() => void>();
  const procedure = { call };
  const namespace = {
    create: procedure,
    delete: procedure,
    exportJson: procedure,
    exportToml: procedure,
    importJson: procedure,
    importToml: procedure,
    preview: procedure,
    previewDelete: procedure,
    previewDraft: procedure,
    previewUpdate: procedure,
    rotateToken: procedure,
    test: procedure,
    update: procedure,
  };

  // The mutation hooks read procedures at render time; only invalidation
  // behavior is under test here, so a shared stub procedure is enough.
  return {
    orpc: {
      destinations: namespace,
      portability: namespace,
      routes: namespace,
      sources: namespace,
    },
  };
});

describe("configuration query invalidation", () => {
  beforeEach(() => {
    testState.invalidateQueries.mockReset().mockResolvedValue(undefined);
  });

  it("invalidates every imported configuration capability", async () => {
    const { result } = renderHook(() => useConfigurationMutations());

    await result.current.invalidateConfiguration();

    expect(testState.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["app-settings"] }],
      [{ queryKey: ["runtime-information"] }],
      [{ queryKey: ["storage-health"] }],
      [{ queryKey: ["worker-health"] }],
      [{ queryKey: ["active-sessions"] }],
      [{ queryKey: ["sources"] }],
      [{ queryKey: ["destinations"] }],
      [{ queryKey: ["routes"] }],
    ]);
  });

  it("registers every configuration read-only projection for invalidation", () => {
    const queryKeyExports = Object.entries(configurationQueries).filter(([exportName]) =>
      exportName.endsWith("QueryKeys"),
    );

    expect(queryKeyExports.length).toBeGreaterThan(0);

    for (const [exportName, queryKeys] of queryKeyExports) {
      expect(isQueryKeyDefinition(queryKeys), `${exportName} exposes an "all" key`).toBe(true);
      if (!isQueryKeyDefinition(queryKeys)) {
        continue;
      }
      expect(configurationReadOnlyQueryKeys).toContainEqual(queryKeys.all);
    }
  });

  it("invalidates source summaries and affected route references", async () => {
    const { result } = renderHook(() => useSourceMutations());

    await result.current.invalidateSources();

    expect(testState.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["sources"] }],
      [{ queryKey: ["routes"] }],
    ]);
  });

  it("invalidates destination summaries and affected route references", async () => {
    const { result } = renderHook(() => useDestinationMutations());

    await result.current.invalidateDestinations();

    expect(testState.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["destinations"] }],
      [{ queryKey: ["routes"] }],
    ]);
  });

  it("invalidates only routes after route mutations", async () => {
    const { result } = renderHook(() => useRouteMutations());

    await result.current.invalidateRoutes();

    expect(testState.invalidateQueries.mock.calls).toEqual([[{ queryKey: ["routes"] }]]);
  });
});
