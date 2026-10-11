import type { DestinationKind } from "@tocsin/core";

import { emailAdapter } from "#destinations/email/index";
import { feishuAdapter } from "#destinations/feishu/index";
import { genericWebhookAdapter } from "#destinations/generic-webhook/index";
import { slackAdapter } from "#destinations/slack/index";
import type {
  DestinationAdapter,
  DestinationCatalogItem,
  DestinationSendContext,
  DestinationSendInput,
  DestinationSendResult,
} from "#destinations/types";
import { DestinationCatalogItemSchema, DestinationManifestSchema } from "#destinations/types";

export class DestinationRegistry {
  private readonly adapters = new Map<DestinationKind, DestinationAdapter>();

  register(adapter: DestinationAdapter): void {
    const manifest = DestinationManifestSchema.parse(adapter.manifest);

    if (this.adapters.has(manifest.kind)) {
      throw new Error(`Destination adapter already registered: ${manifest.kind}`);
    }

    this.adapters.set(manifest.kind, adapter);
  }

  get(kind: DestinationKind): DestinationAdapter {
    const adapter = this.adapters.get(kind);

    if (!adapter) {
      throw new Error(`Unknown destination adapter: ${kind}`);
    }

    return adapter;
  }

  parse(kind: DestinationKind, config: unknown): unknown {
    return this.get(kind).configSchema.parse(config);
  }

  send(
    kind: DestinationKind,
    input: DestinationSendInput<unknown>,
    context?: DestinationSendContext,
  ): Promise<DestinationSendResult> {
    return this.get(kind).send(input, context);
  }

  preview(kind: DestinationKind, input: DestinationSendInput<unknown>) {
    return this.get(kind).preview(input);
  }

  toCatalog(): DestinationCatalogItem[] {
    return this.list.map((adapter) =>
      DestinationCatalogItemSchema.parse({
        kind: adapter.manifest.kind,
        configVersion: adapter.manifest.configVersion,
        lifecycle: adapter.manifest.lifecycle,
        displayNameKey: adapter.manifest.displayNameKey,
        descriptionKey: adapter.manifest.descriptionKey,
        iconName: adapter.manifest.iconName,
        configFields: adapter.manifest.configFields,
        capabilities: adapter.manifest.capabilities,
      }),
    );
  }

  get list(): DestinationAdapter[] {
    return [...this.adapters.values()];
  }
}

export function createDefaultDestinationRegistry(): DestinationRegistry {
  const registry = new DestinationRegistry();

  (
    [
      genericWebhookAdapter,
      feishuAdapter,
      slackAdapter,
      emailAdapter,
    ] satisfies DestinationAdapter[]
  ).forEach((adapter) => registry.register(adapter));

  return registry;
}
