import {
  CreateSuppressionCommandSchema,
  DeleteSuppressionCommandSchema,
  SetSuppressionEnabledCommandSchema,
  UpdateSuppressionCommandSchema,
  type CreateSuppressionCommand,
  type DeleteSuppressionCommand,
  type SetSuppressionEnabledCommand,
  type Suppression,
  type SuppressionMatcher,
  type UpdateSuppressionCommand,
} from "@tocsin/core";

import { requireSuppression } from "#/infra/sqlite/repositories/suppression/suppression.helpers";
import type { SqliteStore } from "#/infra/sqlite/store";
import {
  requireExistingDestinationIds,
  requireExistingSourceIds,
} from "#/server/configuration/configuration-support";
import { DomainValidationError } from "#/server/runtime/domain-errors";
import type {
  ListSuppressionHitsInput,
  SuppressionHits,
  SuppressionImpact,
  SuppressionImpactInput,
  SuppressionServiceOptions,
} from "#/server/suppressions/suppression.service.types";

/**
 * Suppression rule administration.
 *
 * The service owns the two things the repository deliberately does not know
 * about: that a rule may only reference sources and destinations that exist,
 * and that its window must be non-empty. Both are operator-actionable
 * `BAD_REQUEST`s, so they are validated here rather than surfacing as an FK
 * failure or a rule that can never be active.
 */
export class SuppressionService {
  private readonly store: SqliteStore;
  private readonly now: () => string;

  constructor(options: SuppressionServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async listSuppressions(): Promise<Suppression[]> {
    return this.store.suppressions.list();
  }

  async getSuppression(id: string): Promise<Suppression> {
    return requireSuppression(await this.store.suppressions.get(id));
  }

  async createSuppression(command: CreateSuppressionCommand): Promise<Suppression> {
    const input = CreateSuppressionCommandSchema.parse(command);
    const startsAt = input.startsAt ?? this.now();

    requireForwardWindow(startsAt, input.endsAt);

    if (input.matcher) {
      await this.requireKnownMatcherTargets(input.matcher);
    }

    return this.store.suppressions.create({
      name: input.name,
      kind: input.kind,
      enabled: input.enabled,
      reason: input.reason,
      matcher: input.matcher,
      startsAt,
      endsAt: input.endsAt,
    });
  }

  async updateSuppression(command: UpdateSuppressionCommand): Promise<Suppression> {
    const input = UpdateSuppressionCommandSchema.parse(command);
    const existing = requireSuppression(await this.store.suppressions.get(input.id));

    requireForwardWindow(input.startsAt ?? existing.startsAt, input.endsAt ?? existing.endsAt);

    if (input.matcher) {
      await this.requireKnownMatcherTargets(input.matcher);
    }

    return this.store.suppressions.update(input.id, {
      name: input.name,
      kind: input.kind,
      enabled: input.enabled,
      reason: input.reason,
      matcher: input.matcher,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
  }

  async setSuppressionEnabled(command: SetSuppressionEnabledCommand): Promise<Suppression> {
    const input = SetSuppressionEnabledCommandSchema.parse(command);

    requireSuppression(await this.store.suppressions.get(input.id));

    return this.store.suppressions.update(input.id, { enabled: input.enabled });
  }

  async deleteSuppression(command: DeleteSuppressionCommand): Promise<{ id: string }> {
    const input = DeleteSuppressionCommandSchema.parse(command);

    // The repository is idempotent by design, but a delete of a rule that never
    // existed is an operator mistake worth surfacing.
    requireSuppression(await this.store.suppressions.get(input.id));
    await this.store.suppressions.delete(input.id);

    return { id: input.id };
  }

  async listSuppressionHits(input: ListSuppressionHitsInput): Promise<SuppressionHits> {
    requireSuppression(await this.store.suppressions.get(input.id));

    return this.store.history.listDeliveries({
      suppressionId: input.id,
      page: input.page,
      limit: input.limit,
    });
  }

  async getSuppressionImpact(input: SuppressionImpactInput): Promise<SuppressionImpact> {
    requireSuppression(await this.store.suppressions.get(input.id));

    return this.store.history.suppressionDeliveryImpact({ suppressionId: input.id });
  }

  private async requireKnownMatcherTargets(matcher: SuppressionMatcher): Promise<void> {
    await requireExistingSourceIds(matcher.sourceIds, this.store.sources);
    await requireExistingDestinationIds(matcher.destinationIds, this.store.destinations);
  }
}

function requireForwardWindow(startsAt: string, endsAt: string): void {
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new DomainValidationError("A suppression must end after it starts");
  }
}
