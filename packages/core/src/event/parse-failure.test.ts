import { describe, expect, it } from "vite-plus/test";

import { parseFailureMetadataFrom } from "#core/event/parse-failure";

describe("parseFailureMetadataFrom", () => {
  it("projects the diagnostics intake records for a rejected payload", () => {
    expect(
      parseFailureMetadataFrom({
        provider: "grafana",
        parserVersion: 1,
        parseFailed: true,
        payloadHash: "hash-1",
        errorName: "ProviderParseFailure",
        reason: "invalid_payload",
        errorMessage: "alert list is empty",
      }),
    ).toEqual({
      reason: "invalid_payload",
      errorName: "ProviderParseFailure",
      errorMessage: "alert list is empty",
      payloadHash: "hash-1",
    });
  });

  it("returns null for metadata from a successfully parsed alert", () => {
    expect(
      parseFailureMetadataFrom({ provider: "grafana", externalURL: "https://grafana.test" }),
    ).toBeNull();
  });

  it("keeps the failure when one diagnostic field is malformed", () => {
    expect(
      parseFailureMetadataFrom({
        parseFailed: true,
        reason: 42,
        errorMessage: "payload rejected",
      }),
    ).toEqual({ errorMessage: "payload rejected" });
  });

  it("returns null for values that are not metadata objects", () => {
    expect(parseFailureMetadataFrom(null)).toBeNull();
    expect(parseFailureMetadataFrom("parseFailed")).toBeNull();
    expect(parseFailureMetadataFrom(["parseFailed"])).toBeNull();
    expect(parseFailureMetadataFrom({ parseFailed: "true" })).toBeNull();
  });
});
