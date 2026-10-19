import { describe, expect, it } from "vite-plus/test";

import {
  REDACTED_VALUE,
  isSensitiveKey,
  redactHeaders,
  redactJsonValue,
  redactText,
} from "#core/redaction";

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

  it.each([
    "appSecret",
    "app_secret",
    "app-secret",
    "clientSecret",
    "client_secret",
    "apiSecret",
    "api_secret",
    "privateKey",
    "private_key",
    "X-Auth-Token",
    "x-auth-token",
    "X-API-Key",
    "accessToken",
    "refresh-token",
    "signingSecret",
    "credentials",
    "tokenHash",
    "token_hash",
    "token-hash",
  ])("treats %s as a sensitive key", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each([
    "tokenCount",
    "maxTokens",
    "privateKeyId",
    "secretName",
    "publicKey",
    "monkey",
    "title",
    "message",
    "X-Request-Id",
    "Content-Type",
    "payloadHash",
    "hash",
  ])("keeps %s visible", (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });

  it("keeps operational fields next to newly covered secrets", () => {
    expect(
      redactJsonValue({
        clientSecret: "client-secret",
        apiSecret: "api-secret",
        privateKey: "private-key",
        tokenCount: 5,
        maxTokens: 4096,
        privateKeyId: "key-1",
      }),
    ).toEqual({
      clientSecret: REDACTED_VALUE,
      apiSecret: REDACTED_VALUE,
      privateKey: REDACTED_VALUE,
      tokenCount: 5,
      maxTokens: 4096,
      privateKeyId: "key-1",
    });
  });

  it("redacts sensitive assignments inside JSON text", () => {
    expect(redactText('{"clientSecret":"sk-live","tokenCount":5}')).toBe(
      `{"clientSecret":"${REDACTED_VALUE}","tokenCount":5}`,
    );
    expect(redactText('headers: {"X-Auth-Token":"abc123"}')).toBe(
      `headers: {"X-Auth-Token":"${REDACTED_VALUE}"}`,
    );
  });
});
