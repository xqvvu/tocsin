import {
  CreateSourceCommandSchema,
  DeleteSourceCommandSchema,
  RotateSourceTokenCommandSchema,
  UpdateSourceCommandSchema,
  type CreateSourceCommand,
  type DeleteSourceCommand,
  type DeletionImpact,
  type RotateSourceTokenCommand,
  type SourceSummary,
  type UpdateSourceCommand,
} from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import type { SqliteStore } from "#/infra/sqlite/store";
import {
  generateSourceToken as defaultGenerateSourceToken,
  mergeJsonObjects,
} from "#/server/configuration/configuration-support";
import { hashSourceToken } from "#/server/intake/intake.service";
import type {
  CreatedSource,
  RotatedSourceToken,
  SourceServiceOptions,
} from "#/server/sources/source.service.types";

export class SourceService {
  private readonly store: SqliteStore;
  private readonly generateSourceToken: () => string;

  constructor(options: SourceServiceOptions) {
    this.store = options.store;
    this.generateSourceToken = options.generateSourceToken ?? defaultGenerateSourceToken;
  }

  async listSources(): Promise<SourceSummary[]> {
    return this.store.sources.list();
  }

  async createSource(command: CreateSourceCommand): Promise<CreatedSource> {
    const input = CreateSourceCommandSchema.parse(command);
    const token = this.generateSourceToken();
    const source = await this.store.sources.create({
      name: input.name,
      provider: input.provider,
      enabled: input.enabled,
      config: input.config,
      tokenHash: hashSourceToken(token),
    });

    return { source, token };
  }

  async updateSource(command: UpdateSourceCommand): Promise<SourceSummary> {
    const input = UpdateSourceCommandSchema.parse(command);
    const current = await this.store.sources.get(input.id);
    const config =
      current && input.config ? mergeJsonObjects(current.config, input.config) : input.config;

    return this.store.sources.update(input.id, {
      name: input.name,
      provider: input.provider,
      enabled: input.enabled,
      config,
    });
  }

  async rotateSourceToken(command: RotateSourceTokenCommand): Promise<RotatedSourceToken> {
    const input = RotateSourceTokenCommandSchema.parse(command);
    const token = this.generateSourceToken();
    const source = await this.store.sources.update(input.id, {
      tokenHash: hashSourceToken(token),
    });

    return { source, token };
  }

  /**
   * History rows a source delete would cascade to. Read-only: the delete itself
   * keeps its existing hard-delete semantics.
   */
  async previewDeleteSource(command: DeleteSourceCommand): Promise<DeletionImpact> {
    const input = DeleteSourceCommandSchema.parse(command);
    const source = await this.store.sources.get(input.id);

    if (!source) {
      throw new RecordNotFoundError("Source", input.id);
    }

    return this.store.history.countDeletionImpact({ sourceId: input.id });
  }

  async deleteSource(command: DeleteSourceCommand): Promise<{ id: string }> {
    const input = DeleteSourceCommandSchema.parse(command);

    await this.store.transaction(async (tx) => {
      await tx.sources.delete(input.id);
      await tx.routes.removeSourceReference(input.id);
    });

    return { id: input.id };
  }
}
