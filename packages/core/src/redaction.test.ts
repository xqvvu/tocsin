import { describe, expect, it } from "vite-plus/test";

import {
  REDACTED_VALUE,
  isSensitiveKey,
  redactCredentialText,
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

  // Built from parts so GitHub push protection does not classify the fixture
  // as a live webhook URL or Slack token.
  const slackWebhook = [
    "https://hooks.slack.com",
    "services",
    "T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
  ].join("/");
  const slackWebhookRedacted = ["https://hooks.slack.com", "services", "[REDACTED]"].join("/");
  const slackToken = ["xoxb", "1234567890-abcdefghij"].join("-");

  it.each([
    [
      "bearer scheme",
      "request failed: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
      "request failed: Bearer [REDACTED]",
    ],
    ["basic scheme", "proxy said Basic dXNlcjpwYXNzd29yZA==", "proxy said Basic [REDACTED]"],
    ["slack app token", `token ${slackToken} rejected`, "token [REDACTED] rejected"],
    [
      "url userinfo password",
      "failed POST https://svc:supersecret@hooks.example.test/path",
      "failed POST https://svc:[REDACTED]@hooks.example.test/path",
    ],
    ["slack webhook path", `POST ${slackWebhook} failed`, `POST ${slackWebhookRedacted} failed`],
    [
      "feishu webhook path",
      "POST https://open.feishu.cn/open-apis/bot/v2/hook/abcd-1234 failed",
      "POST https://open.feishu.cn/open-apis/bot/v2/hook/[REDACTED] failed",
    ],
    [
      "lark webhook path",
      "POST https://open.larksuite.com/open-apis/bot/v2/hook/abcd-1234 failed",
      "POST https://open.larksuite.com/open-apis/bot/v2/hook/[REDACTED] failed",
    ],
  ])("redacts credential-shaped text: %s", (_case, input, expected) => {
    expect(redactText(input)).toBe(expected);
    expect(redactCredentialText(input)).toBe(expected);
  });

  it.each([
    ["severity id", "severity disk-space-low on node-1"],
    ["token counter", "max_tokens: 4096, tokenCount: 5"],
    ["invalid token wording", "response said invalid_token"],
    ["plain prose", "send the Bearer token later"],
    ["basic authentication", "Basic authentication failed for svc"],
    ["token expiration", "Token expiration is near"],
    ["ordinary url", "GET https://example.test:8080/path failed"],
    ["ssh user without password", "clone ssh://git@github.com/org/repo.git"],
    ["slack prefix alone", "the xoxb- prefix marks a Slack bot"],
  ])("keeps benign text visible: %s", (_case, input) => {
    expect(redactText(input)).toBe(input);
    expect(redactCredentialText(input)).toBe(input);
  });

  it("is idempotent across assignment and value-shape redaction", () => {
    const input = `POST https://svc:supersecret@example.test failed: Authorization: Bearer abcdefgh1234; token=${slackToken}; url ${slackWebhook}`;
    const once = redactText(input);

    expect(redactText(once)).toBe(once);
    expect(redactCredentialText(once)).toBe(once);
  });

  it("redacts credential-shaped strings inside JSON payloads", () => {
    expect(
      redactJsonValue({
        message: "upstream rejected Bearer abcdefgh1234",
        endpoint: "https://svc:supersecret@example.test/hook",
        webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/abcd-1234",
        severity: "disk-space-low",
        tokenCount: 5,
      }),
    ).toEqual({
      message: "upstream rejected Bearer [REDACTED]",
      endpoint: "https://svc:[REDACTED]@example.test/hook",
      webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/[REDACTED]",
      severity: "disk-space-low",
      tokenCount: 5,
    });
  });
});
