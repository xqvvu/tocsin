import {
  CreateFeishuAppCommandSchema,
  DeleteFeishuAppCommandSchema,
  TestFeishuAppCommandSchema,
  UpdateFeishuAppCommandSchema,
  redactText,
  type CreateFeishuAppCommand,
  type DeleteFeishuAppCommand,
  type FeishuAppListItem,
  type FeishuAppReference,
  type FeishuAppSummary,
  type FeishuAppTestResult,
  type TestFeishuAppCommand,
  type UpdateFeishuAppCommand,
} from "@tocsin/core";
import { fetchFeishuTenantAccessToken } from "@tocsin/destinations";
import type { FetchLike } from "@tocsin/destinations";

import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";
import {
  feishuAppSummaryFromApp,
  requireFeishuApp,
} from "#/infra/sqlite/repositories/feishu-app/feishu-app.helpers";
import type { SqliteStore } from "#/infra/sqlite/store";
import { feishuSendModeFromConfig } from "#/server/configuration/configuration-support";
import type { FeishuAppServiceOptions } from "#/server/integrations/feishu-app.service.types";
import { DomainValidationError } from "#/server/runtime/domain-errors";

/**
 * Feishu self-built app (飞书应用) administration.
 *
 * Apps are a reusable resource: registered once, referenced by app-mode Feishu
 * destinations, and protected from deletion while referenced. The secret never
 * leaves the server — list DTOs project {@link FeishuAppSummary} and only the
 * credential test uses it, server-side.
 */
export class FeishuAppService {
  private readonly store: SqliteStore;
  private readonly fetch?: FetchLike;
  private readonly timeoutMs?: number;

  constructor(options: FeishuAppServiceOptions) {
    this.store = options.store;
    this.fetch = options.fetch;
    this.timeoutMs = options.timeoutMs;
  }

  async listFeishuApps(): Promise<FeishuAppListItem[]> {
    const [apps, destinations] = await Promise.all([
      this.store.feishuApps.list(),
      this.store.destinations.list(),
    ]);

    return apps.map((app) => ({
      ...feishuAppSummaryFromApp(app),
      referencedDestinations: findReferencingDestinations(app.id, destinations),
    }));
  }

  async createFeishuApp(command: CreateFeishuAppCommand): Promise<FeishuAppSummary> {
    const input = CreateFeishuAppCommandSchema.parse(command);

    return feishuAppSummaryFromApp(
      await this.store.feishuApps.create({
        name: input.name,
        appId: input.appId,
        appSecret: input.appSecret,
      }),
    );
  }

  async updateFeishuApp(command: UpdateFeishuAppCommand): Promise<FeishuAppSummary> {
    const input = UpdateFeishuAppCommandSchema.parse(command);

    return feishuAppSummaryFromApp(
      await this.store.feishuApps.update(input.id, {
        name: input.name,
        appId: input.appId,
        appSecret: input.appSecret,
      }),
    );
  }

  async deleteFeishuApp(command: DeleteFeishuAppCommand): Promise<{ id: string }> {
    const input = DeleteFeishuAppCommandSchema.parse(command);
    const app = requireFeishuApp(await this.store.feishuApps.get(input.id));
    const references = findReferencingDestinations(app.id, await this.store.destinations.list());

    if (references.length > 0) {
      throw new DomainValidationError(
        `Feishu app "${app.name}" is still referenced by destinations: ${references
          .map((reference) => reference.destinationName)
          .join(", ")}`,
      );
    }

    await this.store.feishuApps.delete(input.id);

    return { id: input.id };
  }

  async testFeishuApp(command: TestFeishuAppCommand): Promise<FeishuAppTestResult> {
    const input = TestFeishuAppCommandSchema.parse(command);
    const app = requireFeishuApp(await this.store.feishuApps.get(input.id));
    const result = await fetchFeishuTenantAccessToken(
      { appId: app.appId, appSecret: app.appSecret },
      { fetch: this.fetch, timeoutMs: this.timeoutMs },
    );

    return {
      success: result.ok,
      appName: app.name,
      // The platform (or a proxy in front of it) can echo request fields in an
      // error message. The destination test path already redacts its failure
      // text; app administration must not be the weaker of the two.
      errorMessage: result.ok ? null : redactText(result.errorMessage),
    };
  }
}

/**
 * Scans destination runtime configs for an `app.appRef` pointing at the app.
 *
 * Only destinations that actually send through the app count: a leftover app
 * block on a webhook-mode config is inert, so it neither blocks deletion nor
 * needs to be cleaned up first. The scan stays defensive so a config in any
 * state cannot break app administration.
 */
function findReferencingDestinations(
  appId: string,
  destinations: DestinationRuntimeConfig[],
): FeishuAppReference[] {
  const references: FeishuAppReference[] = [];

  for (const destination of destinations) {
    if (destination.kind !== "feishu") {
      continue;
    }

    if (feishuSendModeFromConfig(destination.config) !== "app") {
      continue;
    }

    const app = destination.config.app;

    if (!isJsonObject(app) || app.appRef !== appId) {
      continue;
    }

    references.push({
      destinationId: destination.id,
      destinationName: destination.name,
    });
  }

  return references;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
