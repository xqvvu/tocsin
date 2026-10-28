import { describe, expect, it } from "vite-plus/test";

import {
  REDACTED_VALUE,
  isSensitiveKey,
  redactCredentialText,
  redactEventRecord,
  redactHeaders,
  redactJsonText,
  redactJsonValue,
  redactNormalizedEvent,
  redactRouteMatchResults,
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

  it("redacts credential shapes in header values the denylist does not name", () => {
    expect(
      redactHeaders({
        "X-Auth": "Bearer abcdefgh1234",
        "X-Request-Id": "req-1",
      }),
    ).toEqual({
      "X-Auth": "Bearer [REDACTED]",
      "X-Request-Id": "req-1",
    });
  });

  it("redacts assignments inside JSON string leaves at read boundaries", () => {
    expect(
      redactJsonText({
        text: "token=abcd1234",
        note: "disk-space-low",
        nested: ["password: hunter2"],
      }),
    ).toEqual({
      text: "token=[REDACTED]",
      note: "disk-space-low",
      nested: ["password: [REDACTED]"],
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
    "privateKeyPem",
    "private_key_pem",
    "tls.key",
    "tlsKey",
    "TLS.KEY",
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
    "secretAccessKey",
    "aws_secret_access_key",
    "AWS_SECRET_ACCESS_KEY",
    "storage_account_key",
    "shared_access_key",
    "storage_connection_string",
    "databaseConnectionString",
    "sessionKey",
    "sessionId",
    "pwd",
    "pass",
    "dsn",
    "connectionString",
    "accountKey",
    "sharedKey",
    "subscriptionKey",
    "encryptionKey",
    "masterKey",
    "jwt",
    "signature",
    "X-Signature",
    "X-Amz-Signature",
    "x-amz-signature",
    // Prefixed password nouns: the noun has to form its own word, so the
    // camelCase and separator boundaries below are what make these sensitive.
    "dbPass",
    "userPass",
    "dbPwd",
    "DB_PASS",
    "db.pass",
    "db-pwd",
    "x-pass",
  ])("treats %s as a sensitive key", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each([
    "tokenCount",
    "maxTokens",
    "tlsVersion",
    "privateKeyId",
    "aws_access_key_id",
    "account_key_id",
    "secretName",
    "publicKey",
    "monkey",
    "title",
    "message",
    "X-Request-Id",
    "Content-Type",
    "payloadHash",
    "hash",
    "bypass",
    "compass",
    "bypassReason",
    // A glued all-lowercase key has no word boundary to read; the rule stays
    // conservative rather than guessing at English compounds.
    "dbpass",
    "dsnName",
    "signatureAlgorithm",
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

  it("redacts cloud-prefixed credential keys but keeps their identifiers", () => {
    expect(
      redactJsonValue({
        aws_secret_access_key: "aws-secret",
        storage_account_key: "storage-secret",
        storage_connection_string: "AccountName=ops;AccountKey=storage-secret",
        aws_access_key_id: "AKIAEXAMPLE",
        account_key_id: "key-1",
      }),
    ).toEqual({
      aws_secret_access_key: REDACTED_VALUE,
      storage_account_key: REDACTED_VALUE,
      storage_connection_string: REDACTED_VALUE,
      aws_access_key_id: "AKIAEXAMPLE",
      account_key_id: "key-1",
    });
  });

  it("redacts password-abbreviation keys while keeping ordinary words visible", () => {
    expect(
      redactJsonValue({
        dbPass: "db-secret",
        userPass: "user-secret",
        dbPwd: "db-password",
        bypass: true,
        compass: "north",
      }),
    ).toEqual({
      dbPass: REDACTED_VALUE,
      userPass: REDACTED_VALUE,
      dbPwd: REDACTED_VALUE,
      bypass: true,
      compass: "north",
    });
  });

  it("redacts password-abbreviation assignments in free text", () => {
    // An unquoted value runs to the next comma or line break, so the fixture
    // separates the trailing fields the way a real DSN would.
    expect(redactText("dsn user=ops dbPass=hunter2, host=db1, bypass=true")).toBe(
      `dsn user=ops dbPass=${REDACTED_VALUE}, host=db1, bypass=true`,
    );
  });

  it("redacts cloud-prefixed credential assignments inside JSON text", () => {
    expect(
      redactText('{"aws_secret_access_key":"aws-secret","aws_access_key_id":"AKIAEXAMPLE"}'),
    ).toBe(`{"aws_secret_access_key":"${REDACTED_VALUE}","aws_access_key_id":"AKIAEXAMPLE"}`);
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

  // Assembled from parts so push protection does not read the fixture as a
  // real key. Only the PEM framing matters here, not the fake body.
  const pemBlock = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIBOgIBAAJBAKfakebodyN0trealkeymaterial0000000000",
    "-----END RSA PRIVATE KEY-----",
  ].join("\n");

  it("redacts a PEM private key wherever it appears", () => {
    expect(redactText(`upstream note ${pemBlock} end`)).toBe(`upstream note ${REDACTED_VALUE} end`);
    expect(redactCredentialText(pemBlock)).toBe(REDACTED_VALUE);
    expect(redactJsonValue({ value: pemBlock, monitors: ["checkout"] })).toEqual({
      value: REDACTED_VALUE,
      monitors: ["checkout"],
    });
  });

  it("redacts the body of an unquoted multi-line key assignment", () => {
    const output = redactText(`privateKeyPem=${pemBlock}`);

    expect(output).toBe(`privateKeyPem=${REDACTED_VALUE}`);
    expect(output).not.toContain("fakebody");
  });

  it("redacts a JSON-escaped PEM block carried under a neutral key", () => {
    const escaped = pemBlock.replaceAll("\n", "\\n");

    expect(redactText(`{"note":"${escaped}"}`)).toBe(`{"note":"${REDACTED_VALUE}"}`);
  });

  it("keeps public key blocks and TLS versions visible", () => {
    const publicKey = [
      "-----BEGIN PUBLIC KEY-----",
      "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A",
      "-----END PUBLIC KEY-----",
    ].join("\n");

    expect(redactText(publicKey)).toBe(publicKey);
    expect(redactText("tlsVersion: TLSv1.3")).toBe("tlsVersion: TLSv1.3");
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

  it("projects normalized events without touching matching keys", () => {
    expect(
      redactNormalizedEvent({
        title: "Checkout failed after Bearer abcdefgh1234",
        message: "POST https://svc:supersecret@example.test/hook failed",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout:unavailable",
        labels: {
          service: "checkout",
          authorization: "Bearer abcdefgh1234",
          note: "disk-space-low",
        },
        occurredAt: "2026-10-20T00:00:00.000Z",
      }),
    ).toEqual({
      title: "Checkout failed after Bearer [REDACTED]",
      message: "POST https://svc:[REDACTED]@example.test/hook failed",
      severity: "critical",
      status: "firing",
      fingerprint: "checkout:unavailable",
      labels: {
        service: "checkout",
        // A credential-shaped key is redacted by name even when its value has
        // no recognizable credential shape.
        authorization: REDACTED_VALUE,
        note: "disk-space-low",
      },
      occurredAt: "2026-10-20T00:00:00.000Z",
    });
  });

  it("projects route evidence while keeping rule expectations readable", () => {
    expect(
      redactRouteMatchResults([
        {
          routeId: "route-1",
          routeName: "Checkout critical",
          matched: true,
          destinationIds: ["destination-1"],
          checks: [
            {
              field: "title",
              matched: true,
              detail: "Expected title to contain checkout",
              condition: "compare",
              expected: ["checkout"],
              actual: "Checkout failed Bearer abcdefgh1234",
            },
            {
              field: "severity",
              matched: true,
              detail: "No severity condition",
              condition: "none",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        routeId: "route-1",
        routeName: "Checkout critical",
        matched: true,
        destinationIds: ["destination-1"],
        checks: [
          {
            field: "title",
            matched: true,
            detail: "Expected title to contain checkout",
            condition: "compare",
            expected: ["checkout"],
            actual: "Checkout failed Bearer [REDACTED]",
          },
          {
            field: "severity",
            matched: true,
            detail: "No severity condition",
            condition: "none",
          },
        ],
      },
    ]);
  });

  it("hides a label check's value when the label key is credential-shaped", () => {
    expect(
      redactRouteMatchResults([
        {
          routeId: "route-1",
          routeName: "Checkout critical",
          matched: true,
          destinationIds: ["destination-1"],
          checks: [
            {
              field: "label",
              matched: true,
              detail: "Expected label authorization to equal plain-secret",
              condition: "compare",
              labelKey: "authorization",
              expected: ["plain-secret"],
              actual: "plain-secret",
            },
            {
              field: "label",
              matched: true,
              detail: "Expected label apiToken to equal abc123",
              condition: "compare",
              labelKey: "apiToken",
              expected: ["abc123"],
              actual: "abc123",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        routeId: "route-1",
        routeName: "Checkout critical",
        matched: true,
        destinationIds: ["destination-1"],
        checks: [
          {
            field: "label",
            matched: true,
            detail: "Expected label authorization to equal plain-secret",
            condition: "compare",
            labelKey: "authorization",
            expected: ["plain-secret"],
            actual: REDACTED_VALUE,
          },
          {
            field: "label",
            matched: true,
            detail: "Expected label apiToken to equal abc123",
            condition: "compare",
            labelKey: "apiToken",
            expected: ["abc123"],
            actual: REDACTED_VALUE,
          },
        ],
      },
    ]);
  });

  it("keeps a benign label check's value and still redacts credential shapes", () => {
    expect(
      redactRouteMatchResults([
        {
          routeId: "route-1",
          routeName: "Checkout critical",
          matched: true,
          destinationIds: ["destination-1"],
          checks: [
            {
              field: "label",
              matched: true,
              detail: "Expected label service to equal checkout",
              condition: "compare",
              labelKey: "service",
              expected: ["checkout"],
              actual: "checkout",
            },
            {
              field: "label",
              matched: false,
              detail: "Expected label note to contain token=upstream-secret",
              condition: "compare",
              labelKey: "note",
              expected: [],
              actual: "token=upstream-secret",
            },
          ],
        },
      ]),
    ).toEqual([
      {
        routeId: "route-1",
        routeName: "Checkout critical",
        matched: true,
        destinationIds: ["destination-1"],
        checks: [
          {
            field: "label",
            matched: true,
            detail: "Expected label service to equal checkout",
            condition: "compare",
            labelKey: "service",
            expected: ["checkout"],
            actual: "checkout",
          },
          {
            field: "label",
            matched: false,
            detail: "Expected label note to contain token=upstream-secret",
            condition: "compare",
            labelKey: "note",
            expected: [],
            actual: "token=[REDACTED]",
          },
        ],
      },
    ]);
  });

  it("projects a stored event's metadata, payload, headers, and route evidence", () => {
    const event = redactEventRecord({
      id: "event-1",
      sourceId: "source-1",
      idempotencyKey: "Bearer abcdefgh1234",
      normalized: {
        title: "Checkout failed",
        message: "token=upstream-secret",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout:unavailable",
        labels: {},
        occurredAt: "2026-10-20T00:00:00.000Z",
      },
      providerMetadata: {
        externalURL: "https://grafana:supersecret@grafana.test/d/abc",
        receiver: "ops",
        token: "plain-token",
        note: "token=plain-token",
      },
      rawPayload: {
        token: "upstream-secret",
        monitor: "checkout",
        note: "password=hunter2",
      },
      rawHeaders: { Authorization: "Bearer abcdefgh1234", "X-Request-Id": "req-1" },
      routeMatches: [
        {
          routeId: "route-1",
          routeName: "Checkout critical",
          matched: true,
          destinationIds: ["destination-1"],
          checks: [
            {
              field: "message",
              matched: true,
              detail: "Expected message to contain token",
              condition: "compare",
              expected: ["token"],
              actual: "token=upstream-secret",
            },
          ],
        },
      ],
      receivedAt: "2026-10-20T00:00:00.000Z",
    });

    expect(event.idempotencyKey).toBe("Bearer [REDACTED]");
    expect(event.normalized.message).toBe("token=[REDACTED]");
    expect(event.providerMetadata).toEqual({
      externalURL: "https://grafana:[REDACTED]@grafana.test/d/abc",
      receiver: "ops",
      token: REDACTED_VALUE,
      note: "token=[REDACTED]",
    });
    expect(event.rawPayload).toEqual({
      token: REDACTED_VALUE,
      monitor: "checkout",
      note: "password=[REDACTED]",
    });
    expect(event.rawHeaders).toEqual({
      Authorization: REDACTED_VALUE,
      "X-Request-Id": "req-1",
    });
    expect(event.routeMatches?.[0].checks[0].actual).toBe("token=[REDACTED]");
    expect(JSON.stringify(event)).not.toContain("upstream-secret");
    expect(JSON.stringify(event)).not.toContain("supersecret");
  });

  it("projects stored events idempotently", () => {
    const once = redactEventRecord({
      id: "event-1",
      sourceId: "source-1",
      idempotencyKey: null,
      normalized: {
        title: "Checkout failed",
        message: "Authorization: Bearer abcdefgh1234",
        severity: "critical",
        status: "firing",
        fingerprint: "checkout:unavailable",
        labels: { authorization: "Bearer abcdefgh1234" },
        occurredAt: "2026-10-20T00:00:00.000Z",
      },
      providerMetadata: {
        externalURL: "https://grafana:supersecret@grafana.test/d/abc",
      },
      rawPayload: { token: "upstream-secret" },
      rawHeaders: { Authorization: "Bearer abcdefgh1234" },
      routeMatches: null,
      receivedAt: "2026-10-20T00:00:00.000Z",
    });

    expect(redactEventRecord(once)).toEqual(once);
  });
});
