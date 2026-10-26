import type { ActiveSessionsOutput } from "@tocsin/api";

import type { SessionSecurityServiceOptions } from "#/server/security/session-security.service.types";

/**
 * Account-security view of the dashboard session table.
 *
 * Reads `session` rows directly instead of Better Auth's `listSessions`
 * endpoint: that endpoint returns the session token and sits behind the
 * 24-hour fresh-session gate, so opening Settings the day after signing in
 * would fail with `SESSION_NOT_FRESH`. Revocation still goes through Better Auth
 * so cookie and adapter semantics stay in one place.
 *
 * Both operations are self-only. The service takes the caller's user id from
 * the verified dashboard session and never accepts a session or user id from
 * the client: in a single-account instance, cross-account session access would
 * be a dormant account-takeover primitive that activates silently the day a
 * second account exists.
 */
export class SessionSecurityService {
  constructor(private readonly options: SessionSecurityServiceOptions) {}

  async listActiveSessions(input: {
    userId: string;
    currentSessionId: string;
  }): Promise<ActiveSessionsOutput> {
    const sessions = await this.options.store.sessions.listActiveForUser(input.userId);

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        // Normalise empty strings to null so the panel's "unknown" fallback
        // covers records written without a forwarded address or client.
        ipAddress: session.ipAddress || null,
        userAgent: session.userAgent || null,
        current: session.id === input.currentSessionId,
      })),
    };
  }

  async revokeOtherSessions(input: { headers: HeadersInit }): Promise<{ status: boolean }> {
    // Better Auth resolves the account from the request cookie, so the caller's
    // identity never travels as an argument and cannot be spoofed here.
    return this.options.auth.revokeOtherSessions({ headers: input.headers });
  }
}
