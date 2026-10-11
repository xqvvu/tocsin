import { AsyncLocalStorage } from "node:async_hooks";

import { configure, getLogger, reset, type LogRecord } from "@logtape/logtape";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  requestLoggingMiddleware,
  resolveRequestId,
} from "#/middlewares/request-logging.middleware";

const records: LogRecord[] = [];

describe("request logging middleware", () => {
  beforeEach(async () => {
    records.length = 0;
    await reset();
    await configure({
      sinks: {
        recorder: (record) => records.push(record),
      },
      loggers: [
        {
          category: ["tocsin"],
          sinks: ["recorder"],
          lowestLevel: "trace",
        },
        {
          category: ["logtape", "meta"],
          sinks: [],
          lowestLevel: null,
          parentSinks: "override",
        },
      ],
      contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
    });
  });

  afterEach(async () => {
    await reset();
  });

  it("propagates a trusted request id and returns it in the response", async () => {
    const request = new Request("https://tocsin.test/api/events?token=query-secret", {
      headers: {
        authorization: "Bearer header-secret",
        "x-request-id": "request-1",
      },
    });

    const result = await runMiddleware(request, "/api/events", async () => {
      getLogger(["tocsin", "test"]).info("inside request");
      return new Response(null, { status: 204 });
    });

    expect(request.headers.get("x-request-id")).toBe("request-1");
    expect(result.headers.get("x-request-id")).toBe("request-1");
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: ["tocsin", "test"],
          properties: expect.objectContaining({ requestId: "request-1" }),
        }),
        expect.objectContaining({
          category: ["tocsin", "http"],
          level: "info",
          properties: expect.objectContaining({
            requestId: "request-1",
            method: "GET",
            pathname: "/api/events",
            status: 204,
          }),
        }),
      ]),
    );

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("header-secret");
  });

  it("keeps concurrent request contexts isolated", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstPaused = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = runMiddleware(
      new Request("https://tocsin.test/first", {
        headers: { "x-request-id": "request-first" },
      }),
      "/first",
      async () => {
        await firstPaused;
        getLogger(["tocsin", "test"]).info("first completed", { operation: "first" });
        return new Response(null, { status: 200 });
      },
    );
    const second = runMiddleware(
      new Request("https://tocsin.test/second", {
        headers: { "x-request-id": "request-second" },
      }),
      "/second",
      async () => {
        getLogger(["tocsin", "test"]).info("second completed", { operation: "second" });
        return new Response(null, { status: 200 });
      },
    );

    await second;
    releaseFirst?.();
    await first;

    const operationRecords = records.filter(
      (record) => record.category.join(".") === "tocsin.test",
    );

    expect(operationRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          properties: expect.objectContaining({
            operation: "first",
            requestId: "request-first",
          }),
        }),
        expect.objectContaining({
          properties: expect.objectContaining({
            operation: "second",
            requestId: "request-second",
          }),
        }),
      ]),
    );
  });

  it("replaces invalid request ids and lowers successful probes to debug", async () => {
    const request = new Request("https://tocsin.test/api/ready", {
      headers: { "x-request-id": "invalid request id" },
    });
    const requestId = resolveRequestId(request.headers);

    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    await runMiddleware(request, "/api/ready", async () =>
      Response.json({ status: "ok" }, { status: 200 }),
    );

    expect(records).toContainEqual(
      expect.objectContaining({
        category: ["tocsin", "http"],
        level: "debug",
        properties: expect.objectContaining({ pathname: "/api/ready" }),
      }),
    );
  });

  it("preserves immutable redirect responses while adding the request id", async () => {
    const result = await runMiddleware(
      new Request("https://tocsin.test/redirect", {
        headers: { "x-request-id": "request-redirect" },
      }),
      "/redirect",
      async () => Response.redirect("https://tocsin.test/login", 307),
    );

    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("https://tocsin.test/login");
    expect(result.headers.get("x-request-id")).toBe("request-redirect");
  });

  it("logs safe error properties and rethrows unexpected failures", async () => {
    const error = new Error("database failed token=database-secret");

    await expect(
      runMiddleware(new Request("https://tocsin.test/fail"), "/fail", async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(records).toContainEqual(
      expect.objectContaining({
        category: ["tocsin", "http"],
        level: "error",
        properties: expect.objectContaining({
          errorName: "Error",
          errorMessage: "database failed token=[REDACTED]",
        }),
      }),
    );
    expect(JSON.stringify(records)).not.toContain("database-secret");
  });
});

async function runMiddleware(request: Request, pathname: string, handler: () => Promise<Response>) {
  const server = requestLoggingMiddleware.options.server;

  if (!server) {
    throw new Error("Request logging middleware has no server implementation");
  }

  const result = await server({
    request,
    pathname,
    context: undefined,
    handlerType: "router",
    next: async (options?: { context?: { requestId: string } }) => ({
      request,
      pathname,
      context: options?.context,
      response: await handler(),
    }),
  } as never);

  return result instanceof Response ? result : result.response;
}
