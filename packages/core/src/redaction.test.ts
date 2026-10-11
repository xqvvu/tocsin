import { describe, expect, it } from "vite-plus/test";

import { REDACTED_VALUE, redactHeaders, redactJsonValue, redactText } from "#core/redaction";

describe("redaction", () => {
  it("redacts common sensitive headers", () => {
    expect(
      redactHeaders({
        Authorization: "Bearer secret",
        "X-Request-Id": "req-1",
        "X-Tocsin-Source-Token": "source-token",
        Cookie: "session=secret",
      }),
    ).toEqual({
      Authorization: REDACTED_VALUE,
      "X-Request-Id": "req-1",
      "X-Tocsin-Source-Token": REDACTED_VALUE,
      Cookie: REDACTED_VALUE,
    });
  });

  it("redacts nested sensitive JSON fields", () => {
    expect(
      redactJsonValue({
        title: "alert",
        destination: {
          webhook_url: "https://example.test/secret",
          webhookUrl: "https://example.test/camel-secret",
          signSecret: "signing-secret",
          accessToken: "access-token",
          token: "secret",
        },
      }),
    ).toEqual({
      title: "alert",
      destination: {
        webhook_url: REDACTED_VALUE,
        webhookUrl: REDACTED_VALUE,
        signSecret: REDACTED_VALUE,
        accessToken: REDACTED_VALUE,
        token: REDACTED_VALUE,
      },
    });
  });

  it("redacts common sensitive text assignments", () => {
    expect(
      redactText(
        "parser failed: Authorization: Bearer parser-secret; token=abc123, password: hunter2 accessToken=oauth signSecret=robot",
      ),
    ).toBe(
      `parser failed: Authorization: ${REDACTED_VALUE}; token=${REDACTED_VALUE}, password: ${REDACTED_VALUE} accessToken=${REDACTED_VALUE} signSecret=${REDACTED_VALUE}`,
    );
  });
});
