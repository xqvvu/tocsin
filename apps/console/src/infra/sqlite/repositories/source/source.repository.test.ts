import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import type { SourceRuntimeConfig } from "#/infra/sqlite/repositories/source/source.interface";
import { SqliteSourceRepository } from "#/infra/sqlite/repositories/source/source.repository";

const NOW = "2026-10-21T10:00:00.000Z";

/**
 * Pauses right after `get` returns, so a test can commit a concurrent update
 * between the read and the write of another `update` call.
 */
class PausingSourceRepository extends SqliteSourceRepository {
  private pauseNextRead = false;
  private releasePause!: () => void;
  private pausedGate = Promise.resolve();
  private capturedResolve!: () => void;
  readonly staleReadCaptured = new Promise<void>((resolve) => {
    this.capturedResolve = resolve;
  });

  armPause(): void {
    this.pauseNextRead = true;
    this.pausedGate = new Promise<void>((resolve) => {
      this.releasePause = resolve;
    });
  }

  release(): void {
    this.releasePause();
  }

  override async get(id: string): Promise<SourceRuntimeConfig | null> {
    const source = await super.get(id);

    if (this.pauseNextRead) {
      this.pauseNextRead = false;
      this.capturedResolve();
      await this.pausedGate;
    }

    return source;
  }
}

async function openRepository() {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);
  const repository = new PausingSourceRepository(
    new SqliteRepositoryContext({ db, now: () => NOW }),
  );
  await repository.create({
    id: "source-1",
    name: "Prometheus",
    provider: "generic",
    tokenHash: "old-hash",
  });

  return repository;
}

describe("source repository update", () => {
  it("does not restore a stale token hash over a concurrent rotation", async () => {
    const repository = await openRepository();

    repository.armPause();
    const disabling = repository.setEnabled("source-1", false);
    await repository.staleReadCaptured;

    await repository.update("source-1", { tokenHash: "rotated-hash" });
    repository.release();
    await disabling;

    const source = await repository.get("source-1");
    expect(source?.tokenHash).toBe("rotated-hash");
    expect(source?.enabled).toBe(false);
  });

  it("only writes the columns the caller provided", async () => {
    const repository = await openRepository();

    await repository.update("source-1", { name: "Renamed" });
    const source = await repository.get("source-1");

    expect(source?.name).toBe("Renamed");
    expect(source?.tokenHash).toBe("old-hash");
    expect(source?.provider).toBe("generic");
    expect(source?.enabled).toBe(true);
  });
});
