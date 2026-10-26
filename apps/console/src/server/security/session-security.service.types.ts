import type { SqliteStore } from "#/infra/sqlite/store";

/**
 * Narrow slice of the auth runtime the account-security service needs.
 *
 * Declared structurally rather than importing `AuthServer` from the container,
 * so the service does not depend on the assembly module that constructs it.
 */
export interface SessionRevoker {
  revokeOtherSessions(input: { headers: HeadersInit }): Promise<{ status: boolean }>;
}

export interface SessionSecurityServiceOptions {
  store: Pick<SqliteStore, "sessions">;
  auth: SessionRevoker;
}
