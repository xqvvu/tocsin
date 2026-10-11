import { describe, expect, it } from "vite-plus/test";

import type { FetchLike } from "@tocsin/destinations";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import { openSqliteStore } from "#/infra/sqlite/store";
import { FeishuAppService } from "#/server/integrations/feishu-app.service";
import { DomainValidationError } from "#/server/runtime/domain-errors";

const NOW = "2026-10-08T09:30:00.000Z";
const TENANT_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";

describe("FeishuAppService", () => {
  it("creates an app and lists it without the secret", async () => {
    const { service } = await createTestService();

    const created = await service.createFeishuApp({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });

    expect(created).toEqual({
      id: "feishu-app-1",
      name: "SRE pager",
      appId: "cli_sre",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(created).not.toHaveProperty("appSecret");

    const listed = await service.listFeishuApps();

    expect(listed).toEqual([{ ...created, referencedDestinations: [] }]);
    expect(JSON.stringify(listed)).not.toContain("secret-1");
  });

  it("keeps the stored secret when an update omits it and replaces it when provided", async () => {
    const { service, store } = await createTestService();
    const created = await service.createFeishuApp({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });

    await service.updateFeishuApp({ id: created.id, name: "SRE pager two", appId: "cli_sre_two" });
    expect((await store.feishuApps.get(created.id))?.appSecret).toBe("secret-1");

    await service.updateFeishuApp({ id: created.id, appSecret: "secret-2" });
    expect((await store.feishuApps.get(created.id))?.appSecret).toBe("secret-2");
  });

  it("validates credentials against the Feishu tenant access token endpoint", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const { service } = await createTestService({
      fetch: async (url, init) => {
        calls.push({ url, body: typeof init.body === "string" ? init.body : "" });

        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              code: 0,
              msg: "ok",
              tenant_access_token: "t-123",
              expire: 7200,
            }),
        };
      },
    });
    const created = await service.createFeishuApp({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });

    const result = await service.testFeishuApp({ id: created.id });

    expect(result).toEqual({ success: true, appName: "SRE pager", errorMessage: null });
    expect(calls).toEqual([
      {
        url: TENANT_TOKEN_URL,
        body: JSON.stringify({ app_id: "cli_sre", app_secret: "secret-1" }),
      },
    ]);
  });

  it("surfaces Feishu rejections as a failed test with the platform message", async () => {
    const { service } = await createTestService({
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: 99991663, msg: "app not found" }),
      }),
    });
    const created = await service.createFeishuApp({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });

    const result = await service.testFeishuApp({ id: created.id });

    expect(result.success).toBe(false);
    expect(result.appName).toBe("SRE pager");
    expect(result.errorMessage).toContain("99991663");
    expect(result.errorMessage).toContain("app not found");
  });

  it("refuses to delete an app that a destination still references", async () => {
    const { service, store } = await createTestService();
    const created = await service.createFeishuApp({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });

    await store.destinations.create({
      name: "SRE group",
      kind: "feishu",
      config: { sendMode: "app", app: { appRef: created.id, chatId: "oc_group" } },
    });

    await expect(service.deleteFeishuApp({ id: created.id })).rejects.toThrow(
      DomainValidationError,
    );
    await expect(service.deleteFeishuApp({ id: created.id })).rejects.toThrow("SRE group");

    const listed = await service.listFeishuApps();
    expect(listed[0]?.referencedDestinations).toEqual([
      { destinationId: "destination-1", destinationName: "SRE group" },
    ]);
  });

  it("deletes once references are gone and rejects unknown ids", async () => {
    const { service, store } = await createTestService();
    const created = await service.createFeishuApp({
      name: "SRE pager",
      appId: "cli_sre",
      appSecret: "secret-1",
    });

    await store.destinations.create({
      name: "SRE group",
      kind: "feishu",
      config: { sendMode: "app", app: { appRef: created.id, chatId: "oc_group" } },
    });
    await store.destinations.delete("destination-1");

    await service.deleteFeishuApp({ id: created.id });
    expect(await store.feishuApps.get(created.id)).toBeNull();

    await expect(service.deleteFeishuApp({ id: created.id })).rejects.toThrow(RecordNotFoundError);
  });
});

async function createTestService(options: { fetch?: FetchLike } = {}) {
  const store = await openSqliteStore({
    databasePath: ":memory:",
    now: () => NOW,
    ids: {
      feishuApp: () => "feishu-app-1",
      destination: () => "destination-1",
    },
  });
  const service = new FeishuAppService({
    store,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return { store, service };
}
