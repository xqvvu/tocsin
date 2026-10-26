import type { SqliteRepositoryContext } from "#/infra/sqlite/context";
import type {
  ActiveSessionRecord,
  SessionRepository,
} from "#/infra/sqlite/repositories/session/session.interface";

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly context: SqliteRepositoryContext) {}

  async listActiveForUser(userId: string): Promise<ActiveSessionRecord[]> {
    // Better Auth writes `expires_at` as an ISO 8601 UTC string, the same shape
    // `context.now()` produces, so the comparison stays a plain text compare
    // and never has to parse dates in SQLite.
    const rows = await this.context.db
      .selectFrom("session")
      .select(["id", "created_at", "updated_at", "expires_at", "ip_address", "user_agent"])
      .where("user_id", "=", userId)
      .where("expires_at", ">", this.context.now())
      .orderBy("updated_at", "desc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    }));
  }
}
