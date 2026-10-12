import { AsyncLocalStorage } from "node:async_hooks";

import { configure, reset, withContext, type LogRecord } from "@logtape/logtape";
import { createRouterClient } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { ApplicationContainer } from "#/server/runtime/container";

const session = {
  session: { id: "session-1", userId: "user-1" },
  user: { id: "user-1", email: "owner@example.test", role: "owner" },
};

const state = {
  listSources: async (): Promise<unknown> => [],
  getSession: async () => session as unknown,
};

const fakeContainer = {
  createSourceService: async () => ({
    listSources: () => state.listSources(),
  }),
  getAuth: async () => ({
    handler: async () => new Response(null),
    api: {
      getSession: () => state.getSession(),
    },
  }),
} as unknown as ApplicationContainer;

vi.mock("#/server/runtime/container", () => ({
  getApplicationContainer: () => fakeContainer,
}));

const { rpcHandler } = await import("#/server/orpc/handler");
const { router } = await import("#/server/orpc/router");

const records: LogRecord[] = [];

function orpcRecords(): LogRecord[] {
  return records.filter((record) => record.category.join(".") === "tocsin.orpc");
}

describe("oRPC procedure logging", () => {
  beforeEach(async () => {
    records.length = 0;
    state.listSources = async () => [];
    state.getSession = async () => session;
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

  it("logs a translated domain failure at warn with the procedure path", async () => {
    state.listSources = async () => {
      throw new RecordNotFoundError("Source", "source-missing");
    };

    await callRpcHandler("sources/list", undefined);

    expect(orpcRecords()).toEqual([
      expect.objectContaining({
        level: "warning",
        properties: expect.objectContaining({
          procedure: "sources.list",
          errorCode: "NOT_FOUND",
          errorName: "ORPCError",
          errorMessage: "Source not found: source-missing",
        }),
      }),
    ]);
  });

  it("logs unexpected failures at error and redacts the message", async () => {
    state.listSources = async () => {
      throw new Error("upstream exploded token=upstream-secret");
    };

    await callRpcHandler("sources/list", undefined);

    expect(orpcRecords()).toEqual([
      expect.objectContaining({
        level: "error",
        properties: expect.objectContaining({
          procedure: "sources.list",
          errorCode: "INTERNAL_SERVER_ERROR",
          errorName: "Error",
          errorMessage: "upstream exploded token=[REDACTED]",
        }),
      }),
    ]);
    expect(JSON.stringify(records)).not.toContain("upstream-secret");
  });

  it("logs guard rejections at warn with the translated oRPC code", async () => {
    state.getSession = async () => null;

    await callRpcHandler("sources/list", undefined);

    expect(orpcRecords()).toEqual([
      expect.objectContaining({
        level: "warning",
        properties: expect.objectContaining({
          procedure: "sources.list",
          errorCode: "UNAUTHORIZED",
        }),
      }),
    ]);
  });

  it("joins the HTTP request context opened by the request middleware", async () => {
    state.listSources = async () => {
      throw new Error("database failed");
    };

    await withContext({ requestId: "correlated-1" }, () =>
      callRpcHandler("sources/list", undefined),
    );

    expect(orpcRecords()).toEqual([
      expect.objectContaining({
        properties: expect.objectContaining({ requestId: "correlated-1" }),
      }),
    ]);
  });

  it("logs failures made through the in-process SSR client", async () => {
    state.listSources = async () => {
      throw new RecordNotFoundError("Destination", "destination-missing");
    };

    const client = createRouterClient(router, {
      context: async () => ({ reqHeaders: new Headers() }),
    });

    await expect(client.sources.list()).rejects.toThrow(
      "Destination not found: destination-missing",
    );

    expect(orpcRecords()).toEqual([
      expect.objectContaining({
        level: "warning",
        properties: expect.objectContaining({
          procedure: "sources.list",
          errorCode: "NOT_FOUND",
        }),
      }),
    ]);
  });

  it("stays silent for successful calls, which the HTTP access log already covers", async () => {
    const client = createRouterClient(router, {
      context: async () => ({ reqHeaders: new Headers() }),
    });

    await client.health.check();
    await callRpcHandler("sources/list", undefined);

    expect(orpcRecords()).toEqual([]);
  });
});

async function callRpcHandler(path: string, input: unknown): Promise<void> {
  const { response } = await rpcHandler.handle(
    new Request(`http://localhost/api/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=token",
      },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: "/api" },
  );

  await response?.arrayBuffer();
}
