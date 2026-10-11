import type { DestinationKind, JsonObject } from "@tocsin/core";

import type { SqliteStore } from "#/infra/sqlite/store";
import {
  feishuAppRefFromConfig,
  feishuAppTargetFromConfig,
  feishuSendModeFromConfig,
} from "#/server/configuration/configuration-support";
import { DomainValidationError } from "#/server/runtime/domain-errors";

export type DestinationConfigResolver = (input: {
  kind: DestinationKind;
  config: JsonObject;
}) => Promise<JsonObject>;

/**
 * Hydrates a destination runtime config with the server-side references it
 * needs to actually talk to the target system.
 *
 * A Feishu destination in app send mode stores only the app reference; the
 * credential is resolved here — on the delivery send path and the destination
 * test path — so the adapter always receives a complete config and the secret
 * never lands in stored configuration.
 */
export function createDestinationConfigResolver(options: {
  store: Pick<SqliteStore, "feishuApps">;
}): DestinationConfigResolver {
  return async ({ kind, config }) => {
    if (kind !== "feishu" || feishuSendModeFromConfig(config) !== "app") {
      return config;
    }

    const appRef = feishuAppRefFromConfig(config);
    const app = feishuAppTargetFromConfig(config);

    if (!appRef || !app) {
      return config;
    }

    if (typeof app.appId === "string" && typeof app.appSecret === "string") {
      return config;
    }

    const record = await options.store.feishuApps.get(appRef);

    if (!record) {
      throw new DomainValidationError(`Unknown Feishu app reference: ${appRef}`);
    }

    return {
      ...config,
      app: {
        ...app,
        appId: record.appId,
        appSecret: record.appSecret,
      },
    };
  };
}
