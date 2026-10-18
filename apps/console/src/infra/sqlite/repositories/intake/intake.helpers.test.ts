import { describe, expect, it } from "vite-plus/test";

import { isPrunedRawPayload } from "#/infra/sqlite/repositories/intake/intake.helpers";

describe("isPrunedRawPayload", () => {
  it("recognizes the retention sentinel", () => {
    expect(isPrunedRawPayload({ retentionPruned: true })).toBe(true);
  });

  it("does not treat a real payload carrying the same key as pruned", () => {
    expect(isPrunedRawPayload({ retentionPruned: true, title: "Fresh alert" })).toBe(false);
  });

  it("requires the sentinel value to be true", () => {
    expect(isPrunedRawPayload({ retentionPruned: false })).toBe(false);
  });

  it("rejects values that are not JSON objects", () => {
    expect(isPrunedRawPayload(null)).toBe(false);
    expect(isPrunedRawPayload(["retentionPruned"])).toBe(false);
    expect(isPrunedRawPayload("retentionPruned")).toBe(false);
  });
});
