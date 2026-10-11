import type { JsonObject } from "@tocsin/core";
import { describe, expect, it } from "vite-plus/test";

import { parseFastgptProvider } from "#providers/fastgpt/index";
import { createDefaultProviderRegistry } from "#providers/registry";

const receivedAt = "2026-09-25T07:26:00.000Z";

const modelStatusErrorPayload = {
  event: "model_status_error",
  model: {
    model: "speech-01-turbo",
    modelId: "6a995e6514161dc586c6cded",
    name: "speech-01-turbo",
    provider: "MiniMax",
    type: "tts",
  },
  probe: {
    attempts: 4,
    error: '500 {"code":"bad_response","type":"upstream_error","param":"500"}',
    requestEndedAt: "2026-09-25T07:25:10.391Z",
    requestStartedAt: "2026-09-25T07:25:10.363Z",
    startedAt: "2026-09-25T07:25:08.568Z",
  },
  status: "red",
};

const modelStatusRecoveredPayload = {
  event: "model_status_recovered",
  model: {
    model: "speech-01-turbo",
    modelId: "6a995e6514161dc586c6cded",
    name: "speech-01-turbo",
    provider: "MiniMax",
    type: "tts",
  },
  probe: {
    attempts: 1,
    latencyMs: 295,
    requestEndedAt: "2026-09-25T07:30:07.659Z",
    requestStartedAt: "2026-09-25T07:30:07.364Z",
    startedAt: "2026-09-25T07:30:07.364Z",
  },
  status: "green",
};

describe("fastgpt provider parser", () => {
  it("normalizes model status errors as critical firing alerts", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {
        "content-type": "application/json",
      },
      payload: modelStatusErrorPayload,
    });

    expect(result.normalized).toEqual({
      title: "speech-01-turbo model probe failed",
      message:
        'MiniMax tts model probe failed after 4 attempts: 500 {"code":"bad_response","type":"upstream_error","param":"500"}',
      severity: "critical",
      status: "firing",
      fingerprint: "fastgpt:6a995e6514161dc586c6cded",
      labels: {
        provider: "fastgpt",
        model_id: "6a995e6514161dc586c6cded",
        model: "speech-01-turbo",
        model_name: "speech-01-turbo",
        model_provider: "MiniMax",
        model_type: "tts",
        probe_attempts: "4",
      },
      occurredAt: "2026-09-25T07:25:10.391Z",
    });
    expect(result.providerMetadata).toMatchObject({
      provider: "fastgpt",
      parserVersion: 1,
      event: "model_status_error",
      probeStatus: "red",
      modelId: "6a995e6514161dc586c6cded",
      modelName: "speech-01-turbo",
      modelProvider: "MiniMax",
      modelType: "tts",
      probeAttempts: "4",
    });
    expect(result.idempotencyKey).toBe(
      "fastgpt:6a995e6514161dc586c6cded:red:2026-09-25T07:25:10.391Z",
    );
  });

  it("normalizes model status recoveries as resolved alerts", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {},
      payload: modelStatusRecoveredPayload,
    });

    expect(result.normalized).toEqual({
      title: "speech-01-turbo model probe recovered",
      message: "MiniMax tts model probe recovered after 1 attempt in 295 ms",
      severity: "info",
      status: "resolved",
      fingerprint: "fastgpt:6a995e6514161dc586c6cded",
      labels: {
        provider: "fastgpt",
        model_id: "6a995e6514161dc586c6cded",
        model: "speech-01-turbo",
        model_name: "speech-01-turbo",
        model_provider: "MiniMax",
        model_type: "tts",
        probe_attempts: "1",
        probe_latency_ms: "295",
      },
      occurredAt: "2026-09-25T07:30:07.659Z",
    });
    expect(result.idempotencyKey).toBe(
      "fastgpt:6a995e6514161dc586c6cded:green:2026-09-25T07:30:07.659Z",
    );
  });

  it("maps latency status to warning severity while keeping the event firing", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {},
      payload: {
        ...modelStatusErrorPayload,
        probe: {
          ...modelStatusErrorPayload.probe,
          error: null,
          latencyMs: 31_000,
        },
        status: "yellow",
      },
    });

    expect(result.normalized.severity).toBe("warning");
    expect(result.normalized.status).toBe("firing");
    expect(result.normalized.message).toBe("MiniMax tts model probe failed after 4 attempts");
  });

  it("keeps unknown probe statuses visible without inventing severity", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {},
      payload: {
        ...modelStatusRecoveredPayload,
        status: "blue",
        probe: { attempts: 1, requestEndedAt: "2026-09-25T07:30:07.659Z" },
      },
    });

    expect(result.normalized.severity).toBe("unknown");
    expect(result.normalized.status).toBe("resolved");
    expect(result.providerMetadata).toMatchObject({ probeStatus: "blue" });
  });

  it("falls back to the received timestamp when the probe omits timing", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {},
      payload: {
        event: "model_status_error",
        model: { modelId: "model-without-timing" },
        probe: {},
        status: "red",
      },
    });

    expect(result.normalized.occurredAt).toBe("2026-09-25T07:26:00.000Z");
    expect(result.normalized.title).toBe("model-without-timing model probe failed");
    expect(result.normalized.labels).toEqual({
      provider: "fastgpt",
      model_id: "model-without-timing",
    });
  });

  it("normalizes FastGPT test webhook payloads", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {},
      payload: {
        event: "model_status_error",
        model: {
          modelId: "test-model",
          name: "Test Model",
          model: "test-model",
          provider: "FastGPT",
          type: "llm",
        },
        probe: {
          attempts: 4,
          error: "Connection timeout (test probe alert)",
          latencyMs: 5000,
          requestStartedAt: receivedAt,
          requestEndedAt: receivedAt,
          startedAt: receivedAt,
        },
        status: "red",
      },
    });

    expect(result.normalized.title).toBe("Test Model model probe failed");
    expect(result.normalized.message).toBe(
      "FastGPT llm model probe failed after 4 attempts: Connection timeout (test probe alert)",
    );
    expect(result.normalized.fingerprint).toBe("fastgpt:test-model");
    expect(result.normalized.labels).toMatchObject({ probe_latency_ms: "5000" });
  });

  it("never surfaces credential-shaped probe errors", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {
        authorization: "Bearer must-not-be-normalized",
      },
      payload: {
        event: "model_status_error",
        model: { modelId: "gpt-4o-mini", provider: "OpenAI", type: "llm" },
        probe: {
          attempts: 4,
          error:
            '401 {"error":{"message":"Incorrect API key","code":"invalid_api_key"},"apiKey":"sk-live-9f2b7c41d8e5"}',
          requestEndedAt: "2026-09-25T07:25:10.391Z",
        },
        status: "red",
      },
    });

    const serialized = JSON.stringify(result);

    expect(result.normalized.message).toBe(
      "OpenAI llm model probe failed after 4 attempts: probe error redacted",
    );
    expect(serialized).not.toContain("sk-live-9f2b7c41d8e5");
    expect(serialized).not.toContain("must-not-be-normalized");
    expect(serialized).not.toContain("invalid_api_key");
  });

  it("redacts assigned secrets embedded in probe errors", () => {
    const result = parseFastgptProvider({
      sourceId: "source-fastgpt",
      sourceName: "FastGPT probes",
      receivedAt,
      headers: {},
      payload: {
        event: "model_status_error",
        model: { modelId: "claude-sonnet", provider: "Anthropic", type: "llm" },
        probe: {
          attempts: 4,
          error: "gateway rejected request token=abc123def456",
          requestEndedAt: "2026-09-25T07:25:10.391Z",
        },
        status: "red",
      },
    });

    expect(result.normalized.message).toContain("token=[REDACTED]");
    expect(JSON.stringify(result)).not.toContain("abc123def456");
  });

  it("reports structured failures for payloads outside the probe contract", () => {
    const cases: { payload: JsonObject; message: string }[] = [
      {
        payload: { status: "red" },
        message: "FastGPT payload is missing the event field",
      },
      {
        payload: { event: "model_status_error", model: { name: "speech-01-turbo" } },
        message: "FastGPT payload is missing model.modelId for event model_status_error",
      },
      {
        payload: { event: "model_status_degraded", model: { modelId: "speech-01-turbo" } },
        message: "Unsupported FastGPT event: model_status_degraded",
      },
    ];

    for (const testCase of cases) {
      const result = createDefaultProviderRegistry().parse("fastgpt", {
        source: {
          id: "source-fastgpt",
          name: "FastGPT probes",
          provider: "fastgpt",
          enabled: true,
        },
        sourceId: "source-fastgpt",
        sourceName: "FastGPT probes",
        receivedAt,
        headers: {},
        payload: testCase.payload,
        config: {},
      });

      expect(result).toMatchObject({
        ok: false,
        reason: "unsupported_payload",
        message: testCase.message,
      });
    }
  });

  it("rejects non-object FastGPT webhook payloads", () => {
    expect(() =>
      parseFastgptProvider({
        sourceId: "source-fastgpt",
        sourceName: "FastGPT probes",
        receivedAt,
        headers: {},
        payload: "not an object",
      }),
    ).toThrow("Expected fastgpt webhook payload object");
  });

  it("registers FastGPT in the default provider registry", () => {
    const adapter = createDefaultProviderRegistry().get("fastgpt");

    expect(adapter.manifest).toMatchObject({
      provider: "fastgpt",
      displayNameKey: "sources.providers.fastgpt",
      iconName: "fastgpt",
    });
  });
});
