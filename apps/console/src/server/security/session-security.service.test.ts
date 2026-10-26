import { describe, expect, it, vi } from "vite-plus/test";

import type {
  ActiveSessionRecord,
  SessionRepository,
} from "#/infra/sqlite/repositories/session/session.interface";
import { SessionSecurityService } from "#/server/security/session-security.service";
import type { SessionRevoker } from "#/server/security/session-security.service.types";

const CURRENT: ActiveSessionRecord = {
  id: "session-current",
  createdAt: "2026-10-26T01:00:00.000Z",
  updatedAt: "2026-10-27T02:00:00.000Z",
  expiresAt: "2026-11-02T01:00:00.000Z",
  ipAddress: "203.0.113.9",
  userAgent: "Mozilla/5.0 (Macintosh)",
};

const OTHER: ActiveSessionRecord = {
  ...CURRENT,
  id: "session-other",
  ipAddress: null,
  userAgent: null,
};

function createService(
  overrides: {
    listActiveForUser?: SessionRepository["listActiveForUser"];
    revokeOtherSessions?: SessionRevoker["revokeOtherSessions"];
  } = {},
) {
  const listActiveForUser = vi.fn<SessionRepository["listActiveForUser"]>(
    overrides.listActiveForUser ?? (async () => [CURRENT, OTHER]),
  );
  const revokeOtherSessions = vi.fn<SessionRevoker["revokeOtherSessions"]>(
    overrides.revokeOtherSessions ?? (async () => ({ status: true })),
  );

  return {
    service: new SessionSecurityService({
      store: { sessions: { listActiveForUser } },
      auth: { revokeOtherSessions },
    }),
    listActiveForUser,
    revokeOtherSessions,
  };
}

describe("session security service", () => {
  it("lists only the caller's sessions and marks the current one", async () => {
    const { service, listActiveForUser } = createService();

    const result = await service.listActiveSessions({
      userId: "user-1",
      currentSessionId: CURRENT.id,
    });

    expect(listActiveForUser).toHaveBeenCalledWith("user-1");
    expect(result.sessions).toEqual([
      { ...CURRENT, current: true },
      { ...OTHER, current: false },
    ]);
    expect(Object.keys(result.sessions[0]!)).not.toContain("token");
  });

  it("revokes other sessions with the request headers", async () => {
    const { service, revokeOtherSessions } = createService();
    const headers = new Headers({ cookie: "better-auth.session_token=abc" });

    const result = await service.revokeOtherSessions({ headers });

    expect(revokeOtherSessions).toHaveBeenCalledWith({ headers });
    expect(result).toEqual({ status: true });
  });

  it("reports a failed revocation without inventing success", async () => {
    const { service, revokeOtherSessions } = createService({
      revokeOtherSessions: async () => ({ status: false }),
    });

    await expect(service.revokeOtherSessions({ headers: new Headers() })).resolves.toEqual({
      status: false,
    });
    expect(revokeOtherSessions).toHaveBeenCalledOnce();
  });
});
