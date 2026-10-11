import type { FeishuApp, FeishuAppSummary } from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { FeishuAppRow } from "#/infra/sqlite/repositories/feishu-app/feishu-app.interface";

export function feishuAppFromRow(row: FeishuAppRow): FeishuApp {
  return {
    id: row.id,
    name: row.name,
    appId: row.app_id,
    appSecret: row.app_secret,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function feishuAppSummaryFromApp(app: FeishuApp): FeishuAppSummary {
  return {
    id: app.id,
    name: app.name,
    appId: app.appId,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export function requireFeishuApp(app: FeishuApp | null): FeishuApp {
  if (!app) {
    throw new RecordNotFoundError("Feishu app");
  }

  return app;
}
