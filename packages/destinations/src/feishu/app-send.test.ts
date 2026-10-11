import type { JsonObject } from "@tocsin/core";
import { describe, expect, it } from "vite-plus/test";

import { FeishuConfigSchema, feishuSender } from "#destinations/feishu/index";
import type { FeishuConfig } from "#destinations/feishu/index";
import type { DestinationSendInput, FetchLike, FetchLikeResponse } from "#destinations/types";

const TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const MESSAGES_URL = "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id";
const tokenResponse = { code: 0, msg: "ok", tenant_access_token: "t-1", expire: 7200 };
const appTarget = { appRef: "app-1", chatId: "oc_group", appId: "cli_sre", appSecret: "secret-1" };

describe("feishu app send mode", () => {
  it("posts through the app API and captures the message id as the provider reference", async () => {
    const sendResponse = { code: 0, msg: "success", data: { message_id: "om_123" } };
    const { calls, fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse(sendResponse),
    ]);

    const result = await feishuSender.send(
      createInput({ sendMode: "app", app: appTarget, template: textTemplate() }),
      { fetch },
    );

    expect(result.ok).toBe(true);
    expect(result.providerReference).toEqual({ type: "feishu_message_id", value: "om_123" });
    expect(result.responseBody).toBe(JSON.stringify(sendResponse));
    expect(calls.map((call) => call.url)).toEqual([TOKEN_URL, MESSAGES_URL]);
    expect(calls[1]?.init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: "Bearer t-1",
      },
      body: JSON.stringify({
        receive_id: "oc_group",
        msg_type: "text",
        content: JSON.stringify({ text: "Checkout API latency high" }),
      }),
    });
    expect(JSON.stringify(result)).not.toContain("secret-1");
  });

  it("sends the built-in card as interactive content", async () => {
    const { calls, fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0, msg: "success", data: { message_id: "om_card" } }),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result.ok).toBe(true);

    const body = parseRequestBody(calls[1]?.init);

    expect(body?.msg_type).toBe("interactive");
    expect(typeof body?.content).toBe("string");

    const card = JSON.parse(String(body?.content)) as JsonObject;

    expect(card).toHaveProperty("header");
  });

  it("fails as a non-retryable configuration error when credentials were not resolved", async () => {
    const { calls, fetch } = createRecordingFetch([]);

    const result = await feishuSender.send(
      createInput({ sendMode: "app", app: { appRef: "app-1", chatId: "oc_group" } }),
      { fetch },
    );

    expect(result).toMatchObject({
      ok: false,
      errorKind: "configuration_error",
      retryHint: "not_retryable",
    });
    expect(calls).toHaveLength(0);
  });

  it("maps a rejected credential to a non-retryable failure without calling the send API", async () => {
    const { calls, fetch } = createRecordingFetch([
      jsonResponse({ code: 10003, msg: "invalid param" }),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
    });
    expect(calls).toHaveLength(1);
  });

  it("maps a rejected message to a non-retryable failure with the platform message", async () => {
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 230002, msg: "message rejected" }),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
    });
    expect(result.ok ? "" : result.errorMessage).toContain("230002");
  });

  it("keeps documented transient platform codes retryable so the card is posted later", async () => {
    // The platform answers its rate limit with HTTP 400/429 plus code 99991400;
    // a status-only classification would make the delivery permanently fatal.
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 99991400, msg: "request trigger frequency limit" }, 400),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "retryable",
      statusCode: 400,
    });
    expect(result.ok ? "" : result.errorMessage).toContain("99991400");
  });

  it("reports a documented HTTP 400 business rejection as a platform rejection", async () => {
    // The endpoint error tables answer invalid chat, bot-not-in-group, missing
    // scope, etc. with HTTP 400 plus a code. Labelling that an HTTP error would
    // hide which platform rule the delivery tripped.
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 230002, msg: "The bot can not be outside the group." }, 400),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "target_rejected",
      retryHint: "not_retryable",
      statusCode: 400,
    });
    expect(result.ok ? "" : result.errorMessage).toContain("bot to the target group");
  });

  it("explains a missing permission instead of failing opaquely", async () => {
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({
        code: 99991672,
        msg: "Access denied. One of the following scopes is required",
      }),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result.ok ? "" : result.errorMessage).toContain("im:message");
  });
  it("keeps HTTP failures retryable", async () => {
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0 }, 500),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      errorKind: "http_error",
      retryHint: "retryable",
      statusCode: 500,
    });
  });

  it("succeeds without a provider reference when the response carries no message id", async () => {
    const { fetch } = createRecordingFetch([
      jsonResponse(tokenResponse),
      jsonResponse({ code: 0, msg: "success", data: {} }),
    ]);

    const result = await feishuSender.send(createInput({ sendMode: "app", app: appTarget }), {
      fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.providerReference).toBeUndefined();
  });
});

const baseInput = {
  eventId: "event-1",
  source: {
    id: "source-1",
    name: "Grafana prod",
    provider: "grafana",
    enabled: true,
  },
  destination: {
    id: "dest-1",
    name: "Feishu SRE",
    kind: "feishu",
    enabled: true,
  },
  normalizedEvent: {
    title: "Checkout API latency high",
    message: "p95 latency exceeded",
    severity: "critical",
    status: "firing",
    fingerprint: "checkout-latency",
    labels: {
      service: "checkout",
    },
    occurredAt: "2026-06-07T08:00:00.000Z",
  },
} as const;

function createInput(config: JsonObject): DestinationSendInput<FeishuConfig> {
  return {
    ...baseInput,
    config: FeishuConfigSchema.parse(config),
  };
}

function textTemplate(): JsonObject {
  return {
    source: "custom",
    mode: "text",
    text: "{{event.title}}",
  };
}

function parseRequestBody(init: RequestInit | undefined): {
  msg_type?: unknown;
  content?: unknown;
} {
  const body = init?.body;

  return typeof body === "string"
    ? (JSON.parse(body) as { msg_type?: unknown; content?: unknown })
    : {};
}

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
