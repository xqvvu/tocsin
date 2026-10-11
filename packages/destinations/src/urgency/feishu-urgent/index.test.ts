import { describe, expect, it } from "vite-plus/test";

import type { FetchLike, FetchLikeResponse } from "#destinations/types";
import { createFeishuUrgentPhoneAdapter } from "#destinations/urgency/feishu-urgent/index";

const TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const URGENT_URL =
  "https://open.feishu.cn/open-apis/im/v1/messages/om_123/urgent_phone?user_id_type=open_id";

const tokenResponse = { code: 0, msg: "ok", tenant_access_token: "t-1", expire: 7200 };
const pingInput = {
  app: { appId: "cli_sre", appSecret: "secret-1" },
  messageId: "om_123",
  receivers: ["ou_1", "ou_2"],
  userIdType: "open_id" as const,
};

describe("feishu urgent phone channel", () => {
  it("exchanges the app credential and urgent-calls the existing message", async () => {
    const urgentResponse = { code: 0, msg: "success" };
    const { calls, fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse(urgentResponse),
    ]);
    const adapter = createFeishuUrgentPhoneAdapter();

    const result = await adapter.ping(pingInput, {
      fetch,
      now: () => new Date("2026-10-09T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      statusCode: 200,
      responseBody: JSON.stringify(urgentResponse),
    });
    expect(calls.map((call) => call.url)).toEqual([TOKEN_URL, URGENT_URL]);
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ app_id: "cli_sre", app_secret: "secret-1" }),
    });
    expect(calls[1]?.init).toMatchObject({
      method: "PATCH",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: "Bearer t-1",
      },
      // Documented body of the endpoint: a flat `user_id_list`, not wrapped in
      // `urgent_receivers` (that name is the SDK's body *model* type).
      body: JSON.stringify({ user_id_list: ["ou_1", "ou_2"] }),
    });
  });

  it.each([
    ["user_id", "user_id_type=user_id"],
    ["union_id", "user_id_type=union_id"],
  ] as const)("sends the configured %s id type", async (userIdType, query) => {
    const { calls, fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0 }),
    ]);

    await createFeishuUrgentPhoneAdapter().ping({ ...pingInput, userIdType }, { fetch });

    expect(calls[1]?.url).toContain(query);
  });

  it("records a page that the platform silently skipped as a non-retryable rejection", async () => {
    // Documented partial success: code 0 plus the ids it did not call. Tocsin
    // pings one receiver per record, so this receiver never rang.
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0, msg: "success", data: { invalid_user_id_list: ["ou_1"] } }),
    ]);

    const result = await createFeishuUrgentPhoneAdapter().ping(pingInput, { fetch });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
      statusCode: 200,
    });
    expect(result.ok ? "" : result.errorMessage).toContain("ou_1");
    expect(result.ok ? "" : result.errorMessage).not.toContain("ou_2");
  });

  it("treats any skipped receiver on a single-receiver page as a failed call", async () => {
    // The platform echoes the invalid id back; when it does not match the shape
    // we sent (e.g. an internal user id), a one-receiver page still did not ring.
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({
        code: 0,
        msg: "success",
        data: { invalid_user_id_list: ["2921304923074478100"] },
      }),
    ]);

    const result = await createFeishuUrgentPhoneAdapter().ping(
      { ...pingInput, receivers: ["ou_1"] },
      {
        fetch,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
    });
    expect(result.ok ? "" : result.errorMessage).toContain("2921304923074478100");
  });
  it("reuses the tenant token until it is close to expiry", async () => {
    const { calls, fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0 }),
      jsonResponse({ code: 0 }),
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0 }),
    ]);
    const adapter = createFeishuUrgentPhoneAdapter();
    let clock = new Date("2026-10-09T00:00:00.000Z");
    const context = { fetch, now: () => clock };

    await adapter.ping(pingInput, context);
    clock = new Date("2026-10-09T01:00:00.000Z");
    await adapter.ping(pingInput, context);
    clock = new Date("2026-10-09T02:00:00.000Z");
    await adapter.ping(pingInput, context);

    expect(calls.map((call) => call.url)).toEqual([
      TOKEN_URL,
      URGENT_URL,
      URGENT_URL,
      TOKEN_URL,
      URGENT_URL,
    ]);
  });

  it("maps Feishu configuration rejections to non-retryable failures with operator guidance", async () => {
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 230002, msg: "The bot can not be outside the group." }),
    ]);
    const adapter = createFeishuUrgentPhoneAdapter();

    const result = await adapter.ping(pingInput, { fetch });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
      statusCode: 200,
    });
    expect(result.ok ? "" : result.errorMessage).toContain("230002");
    expect(result.ok ? "" : result.errorMessage).toContain("bot to the target group");
    expect(JSON.stringify(result)).not.toContain("secret-1");
  });

  it("keeps the platform message when the endpoint answers a rejection with HTTP 400", async () => {
    // Documented in the endpoint error table: bot-not-in-group and friends are
    // HTTP 400 + code. That is a platform rejection, not a transport failure.
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 230052, msg: "Can not urgent this message." }, 400),
    ]);

    const result = await createFeishuUrgentPhoneAdapter().ping(pingInput, { fetch });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
      statusCode: 400,
    });
    expect(result.ok ? "" : result.errorMessage).toContain("Can not urgent this message.");
    expect(result.ok ? "" : result.errorMessage).toContain("(HTTP 400)");
    expect(result.ok ? "" : result.errorMessage).toContain("owner/admins");
  });

  it.each([
    [99991400, "request trigger frequency limit"],
    [230023, "The user has too many unread urgent messages."],
  ])("keeps transient platform code %s retryable", async (code, msg) => {
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code, msg }),
    ]);

    const result = await createFeishuUrgentPhoneAdapter().ping(pingInput, { fetch });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "retryable",
    });
  });

  it("keeps HTTP and transport failures retryable", async () => {
    const throttled = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0 }, 429),
    ]);

    const throttledResult = await createFeishuUrgentPhoneAdapter().ping(pingInput, {
      fetch: throttled.fetch,
    });

    expect(throttledResult).toMatchObject({
      ok: false,
      errorKind: "http_error",
      retryHint: "retryable",
      statusCode: 429,
    });

    const broken = createRecordingFetch([jsonResponse(tokenResponse), new Error("socket hang up")]);

    const brokenResult = await createFeishuUrgentPhoneAdapter().ping(pingInput, {
      fetch: broken.fetch,
    });

    expect(brokenResult).toMatchObject({
      ok: false,
      errorKind: "network_error",
      retryHint: "retryable",
      statusCode: null,
    });
    expect(brokenResult.ok ? "" : brokenResult.errorMessage).toContain("socket hang up");
  });

  it("replaces a cached token the platform no longer accepts and calls once more", async () => {
    const { calls, fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0, msg: "success" }),
      jsonResponse({ code: 99991663, msg: "Invalid access token for authorization." }),
      jsonResponse({ ...tokenResponse, tenant_access_token: "t-2" }),
      jsonResponse({ code: 0, msg: "success" }),
    ]);
    const adapter = createFeishuUrgentPhoneAdapter();
    const context = { fetch, now: () => new Date("2026-10-09T00:00:00.000Z") };

    // Primes the token cache.
    await adapter.ping(pingInput, context);

    // The cached token has been invalidated platform-side: retry with a fresh one.
    const retried = await adapter.ping(pingInput, context);

    expect(retried).toMatchObject({ ok: true });
    expect(calls).toHaveLength(5);
    expect(calls[2]?.init?.headers).toMatchObject({ Authorization: "Bearer t-1" });
    expect(calls[4]?.init?.headers).toMatchObject({ Authorization: "Bearer t-2" });
    expect(calls[3]?.url).toBe(TOKEN_URL);
  });

  it("fails with the token error when the credential is rejected", async () => {
    const { calls, fetch } = createRecordingFetch([
      jsonResponse({ code: 10003, msg: "invalid param" }),
    ]);
    const adapter = createFeishuUrgentPhoneAdapter();

    const result = await adapter.ping(pingInput, { fetch });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
    });
    expect(result.ok ? "" : result.errorMessage).toContain("10003");
    expect(calls).toHaveLength(1);
  });

  it("treats a token response without `expire` as a short-lived token instead of an expired one", async () => {
    const { calls, fetch } = createRecordingFetch([
      jsonResponse({ code: 0, msg: "ok", tenant_access_token: "t-1" }),
      jsonResponse({ code: 0 }),
      jsonResponse({ code: 0 }),
    ]);
    const adapter = createFeishuUrgentPhoneAdapter();
    let clock = new Date("2026-10-09T00:00:00.000Z");
    const context = { fetch, now: () => clock };

    await adapter.ping(pingInput, context);
    clock = new Date("2026-10-09T00:02:00.000Z");
    await adapter.ping(pingInput, context);

    expect(calls.map((call) => call.url)).toEqual([TOKEN_URL, URGENT_URL, URGENT_URL]);
  });

  it("rejects invalid requests before any network call", async () => {
    const { calls, fetch } = createRecordingFetch([]);
    const adapter = createFeishuUrgentPhoneAdapter();

    const result = await adapter.ping({ ...pingInput, receivers: [] }, { fetch });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "configuration_error",
      retryHint: "not_retryable",
      statusCode: null,
    });
    expect(result.ok ? "" : result.errorMessage).toContain("receivers");
    expect(calls).toHaveLength(0);
  });
});

type FetchStep = FetchLikeResponse | Error;

function createRecordingFetch(script: FetchStep[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });

    const next = script.shift();

    if (!next) {
      throw new Error(`Unexpected fetch call: ${url}`);
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  };

  return { calls, fetch };
}

function jsonResponse(body: unknown, status = 200): FetchLikeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}
