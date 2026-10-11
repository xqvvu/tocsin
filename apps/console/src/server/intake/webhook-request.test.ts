import { describe, expect, it } from "vite-plus/test";

import {
  InvalidWebhookJsonError,
  readWebhookJsonPayload,
  WebhookPayloadTooLargeError,
} from "#/server/intake/webhook-request";

describe("webhook request payload reader", () => {
  it("parses JSON request bodies within the configured size limit", async () => {
    const payload = await readWebhookJsonPayload(
      new Request("https://tocsin.test/webhook", {
        method: "POST",
        body: JSON.stringify({ title: "CPU high" }),
      }),
      { maxBytes: 1024 },
    );

    expect(payload).toEqual({ title: "CPU high" });
  });

  it("rejects requests whose declared content length exceeds the size limit", async () => {
    const request = new Request("https://tocsin.test/webhook", {
      method: "POST",
      headers: {
        "content-length": "2048",
      },
      body: "{}",
    });

    await expect(readWebhookJsonPayload(request, { maxBytes: 1024 })).rejects.toThrow(
      new WebhookPayloadTooLargeError(1024),
    );
  });

  it("rejects streamed bodies that exceed the size limit", async () => {
    const request = new Request("https://tocsin.test/webhook", {
      method: "POST",
      body: JSON.stringify({ message: "x".repeat(1024) }),
    });

    await expect(readWebhookJsonPayload(request, { maxBytes: 32 })).rejects.toThrow(
      new WebhookPayloadTooLargeError(32),
    );
  });

  it("rejects malformed JSON request bodies", async () => {
    const request = new Request("https://tocsin.test/webhook", {
      method: "POST",
      body: "{not json",
    });

    await expect(readWebhookJsonPayload(request, { maxBytes: 1024 })).rejects.toBeInstanceOf(
      InvalidWebhookJsonError,
    );
  });
});
