import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createDefaultDestinationRegistry,
  createDefaultUrgencyRegistry,
} from "@tocsin/destinations";
import { createDefaultProviderRegistry } from "@tocsin/providers";

import type { ApplicationContainer, AuthServer } from "#/server/runtime/container";
import {
  DashboardAuthError,
  DashboardAuthorizationError,
  type BetterAuthSession,
  type DashboardSession,
} from "#/server/runtime/dashboard-session";
import {
  createWebhookRequestContext,
  requireDashboardRequestContext,
} from "#/server/runtime/request-context";

const session: DashboardSession = {
  session: {
    id: "session-1",
    userId: "user-1",
  },
  user: {
    id: "user-1",
    name: "Owner",
    email: "owner@example.test",
    image: null,
    role: "owner",
  },
};

/** Better Auth's own session shape: note it carries `token`, which the
 * projection under test must strip. */
const betterAuthSession: BetterAuthSession = {
  session: {
    id: "session-1",
    userId: "user-1",
    token: "session-token-should-not-leak",
    expiresAt: new Date("2026-07-10T08:00:00.000Z"),
    createdAt: new Date("2026-06-10T08:00:00.000Z"),
    updatedAt: new Date("2026-06-10T08:00:00.000Z"),
  },
  user: {
    id: "user-1",
    email: "owner@example.test",
    emailVerified: true,
    name: "Owner",
    image: null,
    role: "owner",
    createdAt: new Date("2026-06-10T08:00:00.000Z"),
    updatedAt: new Date("2026-06-10T08:00:00.000Z"),
  },
};

const fakeGetSession = vi.fn<
  (input: { headers: HeadersInit }) => Promise<BetterAuthSession | null>
>(async () => null);

const fakeAuth: AuthServer = {
  handler: async () => new Response(null),
  api: {
    getSession: fakeGetSession,
    revokeOtherSessions: async () => ({ status: true }),
  },
};

describe("request context", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("strips the session token when projecting Better Auth's session", async () => {
    // Better Auth's own session carries `session.token`; the dashboard context
    // must not. This is the assertion that keeps a future "just return the
    // session" refactor from shipping a credential to the browser.
    const container = createFakeContainer();
    const context = await requireDashboardRequestContext({
      container,
      headers: { cookie: "better-auth.session_token=token" },
      now: () => "2026-06-10T08:00:00.000Z",
      getSession: async () => betterAuthSession,
    });

    expect(context.dashboardSession).toEqual({
      session: { id: "session-1", userId: "user-1" },
      user: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.test",
        image: null,
        role: "owner",
      },
    });
    expect(JSON.stringify(context.dashboardSession)).not.toContain("session-token-should-not-leak");
    expect(context.dashboardSession.session).not.toHaveProperty("token");
  });

  it("builds dashboard context from an authenticated owner session", async () => {
    const getSession = vi.fn<() => Promise<BetterAuthSession>>(async () => betterAuthSession);
    const container = createFakeContainer();

    const context = await requireDashboardRequestContext({
      container,
      headers: {
        cookie: "better-auth.session_token=token",
        "x-request-id": "request-1",
      },
      now: () => "2026-06-10T08:00:00.000Z",
      getSession,
    });

    expect(context.container).toBe(container);
    expect(context.currentUser).toEqual(session.user);
    // Not `toBe`: the context holds a projection of Better Auth's session, not
    // that object itself — that is what removes the token.
    expect(context.dashboardSession).toEqual(session);
    expect(context.requestId).toBe("request-1");
    expect(context.now).toBe("2026-06-10T08:00:00.000Z");
    expect(getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
  });

  it("rejects missing or non-admin dashboard sessions", async () => {
    await expect(
      requireDashboardRequestContext({
        container: createFakeContainer(),
        headers: new Headers(),
        getSession: async () => null,
      }),
    ).rejects.toBeInstanceOf(DashboardAuthError);

    await expect(
      requireDashboardRequestContext({
        container: createFakeContainer(),
        headers: new Headers(),
        getSession: async () => ({
          ...betterAuthSession,
          user: {
            ...betterAuthSession.user,
            role: "member" as const,
          },
        }),
      }),
    ).rejects.toBeInstanceOf(DashboardAuthorizationError);
  });

  it("builds webhook context without reading dashboard sessions", () => {
    const container = createFakeContainer();

    const context = createWebhookRequestContext({
      container,
      request: new Request("https://tocsin.test/api/sources/source-1/webhook", {
        method: "POST",
        headers: {
          authorization: "Bearer source-token",
          "x-tocsin-provider-secret": "provider-secret",
          "x-correlation-id": "correlation-1",
        },
      }),
      now: () => "2026-06-10T08:00:00.000Z",
    });

    expect(context.sourceToken).toBe("source-token");
    expect(context.hasProviderSecret).toBe(true);
    expect(context.requestId).toBe("correlation-1");
    expect(context.headersRecord).toMatchObject({
      authorization: "Bearer source-token",
      "x-tocsin-provider-secret": "provider-secret",
    });
    expect(fakeGetSession).not.toHaveBeenCalled();
  });
});

function createFakeContainer(): ApplicationContainer {
  return {
    getSqliteStore: async () => {
      throw new Error("SQLite store is not used by request context tests");
    },
    getProviderRegistry: () => createDefaultProviderRegistry(),
    getDestinationRegistry: () => createDefaultDestinationRegistry(),
    createSourceService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createSourceRehearsalService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createDestinationService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createRouteService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createSuppressionService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createFeishuAppService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createAppSettingsService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createRuntimeInformationService: async () => {
      throw new Error("Runtime information service is not used by request context tests");
    },
    createStorageHealthService: async () => {
      throw new Error("Storage health service is not used by request context tests");
    },
    createWorkerHealthService: async () => {
      throw new Error("Worker health service is not used by request context tests");
    },
    createConfigPortabilityService: async () => {
      throw new Error("Configuration services are not used by request context tests");
    },
    createWebhookIntakeService: async () => {
      throw new Error("Webhook intake service is not used by request context tests");
    },
    createDeliveryWorker: async () => {
      throw new Error("Delivery worker is not used by request context tests");
    },
    createEventReplayService: async () => {
      throw new Error("Event replay service is not used by request context tests");
    },
    createOperationsService: async () => {
      throw new Error("Operations service is not used by request context tests");
    },
    createSessionSecurityService: async () => {
      throw new Error("Session security service is not used by request context tests");
    },
    getUrgencyRegistry: () => createDefaultUrgencyRegistry(),
    createOncallService: async () => {
      throw new Error("On-call service is not used by request context tests");
    },
    createOncallWorker: async () => {
      throw new Error("On-call worker is not used by request context tests");
    },
    ensureOncallWorkerRunner: async () => ({
      runNow: async () => null,
      getHealth: () => ({
        state: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      }),
      stop: () => {},
    }),
    ensureDeliveryWorkerRunner: async () => ({
      runNow: async () => null,
      getHealth: () => ({
        state: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        lastRun: null,
      }),
      stop: () => {},
    }),
    getBetterAuthDatabase: async () => {
      throw new Error("Auth database is not used by request context tests");
    },
    hasRegisteredUsers: async () => false,
    getAuth: async () => fakeAuth,
    dispose: async () => {},
  } satisfies ApplicationContainer;
}
