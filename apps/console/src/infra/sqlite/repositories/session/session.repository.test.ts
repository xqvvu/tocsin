import { describe, expect, it } from "vite-plus/test";

import { createSqliteDatabase } from "#/infra/sqlite/connection";
import { SqliteRepositoryContext } from "#/infra/sqlite/context";
import { migrateSqliteDatabase } from "#/infra/sqlite/migrate";
import { SqliteSessionRepository } from "#/infra/sqlite/repositories/session/session.repository";
import type { SqliteKysely } from "#/infra/sqlite/schema";

const NOW = "2026-10-27T03:00:00.000Z";

interface SessionSeed {
  id: string;
  userId?: string;
  token?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

async function openRepository(): Promise<{
  db: SqliteKysely;
  repository: SqliteSessionRepository;
}> {
  const db = createSqliteDatabase({ databasePath: ":memory:" });
  await migrateSqliteDatabase(db);
  const repository = new SqliteSessionRepository(
    new SqliteRepositoryContext({ db, now: () => NOW }),
  );

  return { db, repository };
}

async function seedSession(db: SqliteKysely, seed: SessionSeed): Promise<void> {
  // `session.user_id` is a real foreign key, so the owning account has to exist
  // even though these tests only read the session table.
  await db
    .insertInto("user")
    .values({
      id: seed.userId ?? "user-1",
      name: "Operator",
      email: `${seed.userId ?? "user-1"}@example.test`,
      email_verified: 0,
      image: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();

  await db
    .insertInto("session")
    .values({
      id: seed.id,
      user_id: seed.userId ?? "user-1",
      // Never asserted on, but the column is NOT NULL and mirrors the shape the
      // auth runtime writes.
      token: seed.token ?? `token-${seed.id}`,
      created_at: seed.createdAt ?? "2026-10-26T00:00:00.000Z",
      updated_at: seed.updatedAt ?? "2026-10-26T00:00:00.000Z",
      expires_at: seed.expiresAt ?? "2026-11-02T00:00:00.000Z",
      ip_address: seed.ipAddress ?? null,
      user_agent: seed.userAgent ?? null,
    })
    .execute();
}

describe("session repository", () => {
  it("projects only the safe columns, never the token", async () => {
    const { db, repository } = await openRepository();
    await seedSession(db, {
      id: "session-1",
      ipAddress: "203.0.113.9",
      userAgent: "Mozilla/5.0",
    });

    const sessions = await repository.listActiveForUser("user-1");

    expect(sessions).toEqual([
      {
        id: "session-1",
        createdAt: "2026-10-26T00:00:00.000Z",
        updatedAt: "2026-10-26T00:00:00.000Z",
        expiresAt: "2026-11-02T00:00:00.000Z",
        ipAddress: "203.0.113.9",
        userAgent: "Mozilla/5.0",
      },
    ]);
    expect(Object.keys(sessions[0]!)).not.toContain("token");
  });

  it("filters expired sessions and other users", async () => {
    const { db, repository } = await openRepository();
    await seedSession(db, { id: "active" });
    await seedSession(db, { id: "expired", expiresAt: "2026-10-26T23:59:59.000Z" });
    await seedSession(db, { id: "other-user", userId: "user-2" });

    const sessions = await repository.listActiveForUser("user-1");

    expect(sessions.map((session) => session.id)).toEqual(["active"]);
  });

  it("orders by most recent activity", async () => {
    const { db, repository } = await openRepository();
    await seedSession(db, { id: "older", updatedAt: "2026-10-26T01:00:00.000Z" });
    await seedSession(db, { id: "newer", updatedAt: "2026-10-26T02:00:00.000Z" });

    const sessions = await repository.listActiveForUser("user-1");

    expect(sessions.map((session) => session.id)).toEqual(["newer", "older"]);
  });
});
