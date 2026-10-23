import { describe, expect, it } from "vite-plus/test";

import { routeSourceReachability } from "#/features/routes/model/route-source-reachability";

describe("route source reachability", () => {
  it("reports every matched source disabled for a catch-all rule", () => {
    expect(
      routeSourceReachability({ sourceIds: [] }, [
        sourceFixture("source-1", false),
        sourceFixture("source-2", false),
      ]),
    ).toEqual({ kind: "all-disabled", sourceCount: 2 });
  });

  it("stays reachable when a catch-all rule matches one enabled source", () => {
    expect(
      routeSourceReachability({ sourceIds: [] }, [
        sourceFixture("source-1", false),
        sourceFixture("source-2", true),
      ]),
    ).toEqual({ kind: "reachable" });
  });

  it("only considers the sources named by the rule", () => {
    expect(
      routeSourceReachability({ sourceIds: ["source-1"] }, [
        sourceFixture("source-1", true),
        sourceFixture("source-2", false),
      ]),
    ).toEqual({ kind: "reachable" });

    expect(
      routeSourceReachability({ sourceIds: ["source-1", "source-2"] }, [
        sourceFixture("source-1", false),
        sourceFixture("source-2", false),
        sourceFixture("source-3", true),
      ]),
    ).toEqual({ kind: "all-disabled", sourceCount: 2 });
  });

  it("reports no matching source when every named source is gone", () => {
    expect(
      routeSourceReachability({ sourceIds: ["deleted-source"] }, [sourceFixture("source-1", true)]),
    ).toEqual({ kind: "no-source" });
  });

  it("reports no matching source when no source is configured", () => {
    expect(routeSourceReachability({ sourceIds: [] }, [])).toEqual({ kind: "no-source" });
  });
});

function sourceFixture(id: string, enabled: boolean) {
  return { id, enabled };
}
