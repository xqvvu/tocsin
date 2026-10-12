import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { routeTree } from "#/route-tree.gen";

/**
 * The RPC transport is mounted on the `/api/$` splat. That puts it beside
 * `/api/health`, `/api/ready`, `/api/auth/$`, `/api/openapi/$` and
 * `/api/sources/$sourceId/webhook` — every one of which must keep winning at
 * its own path.
 *
 * This is not hypothetical: a splat that swallowed its siblings would still
 * type-check, still build, and only show up as `/api/health` mysteriously
 * answering with an RPC 404 in production. Routing precedence is the kind of
 * thing that is asserted, not assumed.
 */
describe("api route precedence", () => {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
  });

  /**
   * Which route won, as a pattern rather than a concrete path.
   *
   * `matchRoutes` returns the whole match chain; the deepest entry's `id` is
   * that chain concatenated ("/api/health/api/health"), so the winning pattern
   * is the id with the chain's own suffix chopped off — i.e. the first half.
   */
  function matchedPattern(pathname: string): string {
    const deepest = router.matchRoutes(pathname, {}).at(-1);
    const id = deepest?.id ?? "";

    if (!id) {
      return "";
    }

    // id === `<pattern><concretePath>`; the concrete path is the tail, and it
    // is itself a suffix of the full id, so pattern = id minus that suffix.
    const concrete = (deepest as { pathname?: string } | undefined)?.pathname ?? "";

    return concrete && id.endsWith(concrete) ? id.slice(0, -concrete.length) : id;
  }

  it("keeps the concrete api routes ahead of the rpc splat", () => {
    expect(matchedPattern("/api/health")).toBe("/api/health");
    expect(matchedPattern("/api/ready")).toBe("/api/ready");
  });

  it("keeps the nested splats ahead of the rpc splat", () => {
    // auth and openapi are splats of their own; the deeper static prefix wins.
    expect(matchedPattern("/api/auth/session")).toBe("/api/auth/$");
    expect(matchedPattern("/api/openapi/anything")).toBe("/api/openapi/$");
  });

  it("keeps the source webhook path intact", () => {
    // The ingest endpoint operators configure in their alerting tools. Losing
    // it to the RPC handler would silently stop every webhook at once.
    expect(matchedPattern("/api/sources/source-1/webhook")).toBe("/api/sources/$sourceId/webhook");
  });

  it("routes everything else under /api to the rpc splat", () => {
    // An RPC procedure path, e.g. POST /api/sources/list.
    expect(matchedPattern("/api/sources/list")).toBe("/api/$");
    expect(matchedPattern("/api/operations/getEventDetail")).toBe("/api/$");
    expect(matchedPattern("/api/settings/get")).toBe("/api/$");
  });
});
