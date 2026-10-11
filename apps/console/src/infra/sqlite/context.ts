import "@tanstack/react-start/server-only";
import { randomUUID } from "node:crypto";

import type { IsoDateTimeString } from "@tocsin/core";

import type { SqliteExecutor, SqliteTransaction } from "#/infra/sqlite/schema";
import { transaction } from "#/infra/sqlite/transaction";

export interface SqliteRepositoryContextOptions {
  db: SqliteExecutor;
  now?: () => IsoDateTimeString;
  ids?: Partial<{
    source: () => string;
    destination: () => string;
    route: () => string;
    event: () => string;
    delivery: () => string;
    attempt: () => string;
    feishuApp: () => string;
    oncallPing: () => string;
  }>;
}

export class SqliteRepositoryContext {
  readonly db: SqliteExecutor;
  readonly now: () => IsoDateTimeString;
  readonly ids: {
    source: () => string;
    destination: () => string;
    route: () => string;
    event: () => string;
    delivery: () => string;
    attempt: () => string;
    feishuApp: () => string;
    oncallPing: () => string;
  };

  constructor(options: SqliteRepositoryContextOptions) {
    this.db = options.db;
    this.now = options.now ?? (() => new Date().toISOString());
    this.ids = {
      source: options.ids?.source ?? randomUUID,
      destination: options.ids?.destination ?? randomUUID,
      route: options.ids?.route ?? randomUUID,
      event: options.ids?.event ?? randomUUID,
      delivery: options.ids?.delivery ?? randomUUID,
      attempt: options.ids?.attempt ?? randomUUID,
      feishuApp: options.ids?.feishuApp ?? randomUUID,
      oncallPing: options.ids?.oncallPing ?? randomUUID,
    };
  }

  async runInTransaction<T>(fn: (context: SqliteRepositoryContext) => Promise<T>): Promise<T> {
    if (this.db.isTransaction) {
      return fn(this);
    }

    return transaction(this.db, async (tx) => fn(this.withDb(tx)));
  }

  private withDb(db: SqliteTransaction): SqliteRepositoryContext {
    return new SqliteRepositoryContext({
      db,
      now: this.now,
      ids: this.ids,
    });
  }
}
