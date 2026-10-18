import { describe, expect, it } from "vite-plus/test";

import { DestinationTimeoutError } from "#destinations/transport";
import { Send } from "#destinations/utils";

describe("Send.transportFailureResult", () => {
  it("classifies a deadline as a retryable timeout", () => {
    expect(
      Send.transportFailureResult({
        error: new DestinationTimeoutError(10_000),
        renderedPayload: { title: "alert" },
      }),
    ).toMatchObject({
      ok: false,
      errorKind: "timeout",
      retryHint: "retryable",
      errorMessage: "Destination request timed out after 10000ms",
      statusCode: null,
      responseBody: null,
      renderedPayload: { title: "alert" },
    });
  });

  it("keeps other transport errors as retryable network errors", () => {
    expect(
      Send.transportFailureResult({
        error: new Error("socket closed"),
        renderedPayload: {},
      }),
    ).toMatchObject({
      ok: false,
      errorKind: "network_error",
      retryHint: "retryable",
      errorMessage: "Destination transport failed: socket closed",
    });
  });
});

describe("Send.readResponseBody", () => {
  it("rethrows a timeout instead of treating the body as empty", async () => {
    const response = {
      text: async () => {
        throw new DestinationTimeoutError(10_000);
      },
    };

    await expect(Send.readResponseBody(response)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("keeps returning an empty body for other read errors", async () => {
    const response = {
      text: async () => {
        throw new Error("body already used");
      },
    };

    await expect(Send.readResponseBody(response)).resolves.toBe("");
  });
});
