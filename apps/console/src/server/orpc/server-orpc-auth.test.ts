import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApplicationContainer } from "#/server/runtime/container";

/**
 * Auth-free container: every capability service factory throws, so a private
 * procedure that reaches its handler fails loudly instead of silently passing
 * this test. Only the auth session lookup and the bootstrap flag are real.
 */
const fakeContainer = {
  hasRegisteredUsers: async () => false,
  getAuth: async () => ({
    handler: async () => new Response(null),
    api: {
      getSession: async () => null,
    },
  }),
  createSourceService: async () => {
    throw new Error("sources procedures must not run without a dashboard session");
  },
  createDestinationService: async () => {
    throw new Error("destination procedures must not run without a dashboard session");
  },
  createRouteService: async () => {
    throw new Error("routes procedures must not run without a dashboard session");
  },
  createSuppressionService: async () => {
    throw new Error("suppressions procedures must not run without a dashboard session");
  },
  createFeishuAppService: async () => {
    throw new Error("integrations procedures must not run without a dashboard session");
  },
  createAppSettingsService: async () => ({
    getAppSettings: async () => ({
      locale: "zh-CN",
      timeZone: "Asia/Shanghai",
      rawPayloadRetentionDays: 7,
    }),
  }),
  createConfigPortabilityService: async () => {
    throw new Error("portability procedures must not run without a dashboard session");
  },
  createEventReplayService: async () => {
    throw new Error("replay procedures must not run without a dashboard session");
  },
  createOperationsService: async () => {
    throw new Error("operations procedures must not run without a dashboard session");
  },
  createDeliveryWorker: async () => {
    throw new Error("worker procedures must not run without a dashboard session");
  },
} as unknown as ApplicationContainer;

vi.mock("#/server/runtime/container", () => ({
  getApplicationContainer: () => fakeContainer,
}));

const { router } = await import("#/server/orpc/router");

const orpcDir = path.resolve(import.meta.dirname);
const featuresDir = path.join(orpcDir, "features");
const srcDir = path.resolve(orpcDir, "../..");
const routesDir = path.join(srcDir, "routes");
const routerFiles = readdirSync(featuresDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/**
 * Expected procedure inventory per feature router, mirroring
 * `packages/api/src/contract`. Public procedures are reachable without a
 * dashboard session by design: the login/setup routes need the bootstrap flag,
 * the root route resolves the interface locale before a session exists, and
 * health is a liveness probe.
 */
const expectedProcedures: Record<
  string,
  { public: readonly string[]; private: readonly string[] }
> = {
  // Keyed by feature DIRECTORY name, which is `session` — named for what it
  // exposes, and deliberately not `auth`, which better-auth owns at /api/auth/*.
  session: { public: ["getDashboardSession", "getAuthBootstrap"], private: [] },
  destinations: {
    public: [],
    private: [
      "list",
      "listCatalog",
      "getTemplateDraft",
      "create",
      "update",
      "delete",
      "test",
      "preview",
      "previewDraft",
      "previewUpdate",
    ],
  },
  health: { public: ["check"], private: [] },
  i18n: { public: ["getRequestLocale"], private: [] },
  integrations: {
    public: [],
    private: [
      "listFeishuApps",
      "createFeishuApp",
      "updateFeishuApp",
      "deleteFeishuApp",
      "testFeishuApp",
    ],
  },
  operations: {
    public: [],
    private: [
      "list",
      "getEventDetail",
      "getDeliveryDetail",
      "getDeliveryBacklog",
      "retryDelivery",
      "buzzDelivery",
      "previewEventReplay",
      "replayEvent",
      "previewRouteReplay",
      "replayRouteEvents",
      "runDeliveryWorker",
    ],
  },
  portability: { public: [], private: ["exportToml", "exportJson", "importToml", "importJson"] },
  routes: { public: [], private: ["list", "create", "update", "delete"] },
  suppressions: {
    public: [],
    private: ["list", "get", "hits", "create", "update", "setEnabled", "delete"],
  },
  settings: {
    public: [],
    private: ["get", "getRuntime", "getStorageHealth", "getWorkerHealth", "update"],
  },
  sources: {
    public: [],
    private: ["list", "create", "update", "rotateToken", "delete"],
  },
};

/**
 * Schema-valid arguments per procedure. The guard middleware runs after input
 * validation, so an unauthenticated call only reaches `requireDashboard()` when
 * the input itself validates; otherwise the test would observe BAD_REQUEST and
 * pass for the wrong reason.
 */
const procedureArgs: Record<string, unknown> = {
  check: undefined,
  getRequestLocale: undefined,
  getAuthBootstrap: undefined,
  getDashboardSession: undefined,
  list: { limit: 20, eventPage: 1 },
  listCatalog: undefined,
  get: undefined,
  getTemplateDraft: { id: "destination-missing" },
  create: {
    name: "probe",
    provider: "generic",
    kind: "feishu",
    enabled: true,
    config: {},
    destinationIds: ["destination-missing"],
  },
  update: { id: "destination-missing", rawPayloadRetentionDays: 1 },
  delete: { id: "destination-missing" },
  rotateToken: { id: "source-missing" },
  listFeishuApps: undefined,
  createFeishuApp: { name: "probe", appId: "cli_probe", appSecret: "probe-secret" },
  updateFeishuApp: { id: "feishu-app-missing" },
  deleteFeishuApp: { id: "feishu-app-missing" },
  testFeishuApp: { id: "feishu-app-missing" },
  test: { id: "destination-missing" },
  preview: { id: "destination-missing" },
  previewDraft: { name: "probe", kind: "feishu", config: {} },
  previewUpdate: { id: "destination-missing" },
  exportToml: {},
  exportJson: {},
  importToml: { toml: "probe" },
  importJson: { json: "probe" },
  getEventDetail: { id: "event-missing" },
  getDeliveryDetail: { id: "delivery-missing" },
  retryDelivery: { id: "delivery-missing" },
  buzzDelivery: { id: "delivery-missing" },
  previewEventReplay: { eventId: "event-missing" },
  replayEvent: { eventId: "event-missing" },
  previewRouteReplay: { routeId: "route-missing" },
  replayRouteEvents: { routeId: "route-missing", eventIds: ["event-missing"] },
  runDeliveryWorker: {},
};

/**
 * Arguments that cannot be shared by procedure name because the namespaces
 * disagree on the input shape (`create`, `get`). The guard middleware runs after
 * input validation, so a wrong argument here would show up as BAD_REQUEST and
 * the auth assertion would pass for the wrong reason.
 */
const featureProcedureArgs: Record<string, unknown> = {
  "suppressions.create": {
    name: "probe",
    kind: "silence",
    matcher: {},
    endsAt: "2030-01-01T00:00:00.000Z",
  },
  "suppressions.get": { id: "suppression-missing" },
  "suppressions.hits": { id: "suppression-missing" },
  "suppressions.setEnabled": { id: "suppression-missing", enabled: false },
};

function argsFor(feature: string, procedure: string): unknown {
  return featureProcedureArgs[`${feature}.${procedure}`] ?? procedureArgs[procedure];
}

describe("dashboard oRPC auth gates", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(routerFiles)("mirrors the contract inventory in the %s router", (feature) => {
    const source = readFileSync(path.join(featuresDir, feature, "router.ts"), "utf8");
    const procedures = procedureSources(source);
    const expected = expectedProcedures[feature];

    expect(expected, `no expected inventory for the ${feature} router`).toBeDefined();
    expect(procedures.map((procedure) => procedure.name).sort()).toEqual(
      [...expected!.public, ...expected!.private].sort(),
    );
  });

  it("rejects every private procedure without a dashboard session", async () => {
    const client = createRouterClient(router, {
      context: { reqHeaders: new Headers() },
    }) as unknown as Record<string, Record<string, (input?: unknown) => Promise<unknown>>>;

    const privateProcedures = routerFiles.flatMap((feature) =>
      expectedProcedures[feature]!.private.map(
        (procedure) => [feature, procedure] as [string, string],
      ),
    );
    expect(privateProcedures.length).toBeGreaterThan(0);

    const observed = await Promise.all(
      privateProcedures.map(async ([feature, procedure]) => {
        const code = await client[feature]![procedure]!(argsFor(feature, procedure)).then(
          () => "RESOLVED",
          (error: { code?: string }) => error.code ?? "NO_CODE",
        );

        return [`${feature}.${procedure}`, code] as const;
      }),
    );

    expect(Object.fromEntries(observed)).toEqual(
      Object.fromEntries(privateProcedures.map(([f, p]) => [`${f}.${p}`, "UNAUTHORIZED"])),
    );
  });

  it("serves every public procedure without a dashboard session", async () => {
    const client = createRouterClient(router, {
      context: { reqHeaders: new Headers() },
    }) as unknown as Record<string, Record<string, (input?: unknown) => Promise<unknown>>>;

    const publicProcedures = routerFiles.flatMap((feature) =>
      expectedProcedures[feature]!.public.map(
        (procedure) => [feature, procedure] as [string, string],
      ),
    );
    expect(publicProcedures.length).toBeGreaterThan(0);

    const observed = await Promise.all(
      publicProcedures.map(async ([feature, procedure]) => {
        const code = await client[feature]![procedure]!(procedureArgs[procedure]).then(
          () => "RESOLVED",
          (error: { code?: string }) => error.code ?? "NO_CODE",
        );

        return [`${feature}.${procedure}`, code] as const;
      }),
    );

    expect(Object.fromEntries(observed)).toEqual(
      Object.fromEntries(publicProcedures.map(([f, p]) => [`${f}.${p}`, "RESOLVED"])),
    );
  });

  it("keeps the webhook intake off the dashboard auth path", () => {
    const webhookRoute = readFileSync(
      path.join(routesDir, "api/sources/$sourceId/webhook.ts"),
      "utf8",
    );

    expect(webhookRoute).not.toContain("requireDashboard");
    expect(webhookRoute).not.toContain("orpc");
  });

  it("protects the dashboard route loader with a login redirect", () => {
    const indexRoute = readFileSync(path.join(routesDir, "index.tsx"), "utf8");
    const dashboardRoute = readFileSync(path.join(routesDir, "_dashboard.tsx"), "utf8");
    const loginRoute = readFileSync(path.join(routesDir, "login.tsx"), "utf8");
    const setupRoute = readFileSync(path.join(routesDir, "setup.tsx"), "utf8");
    const authQueries = readFileSync(
      path.join(srcDir, "features/auth/api/auth.queries.ts"),
      "utf8",
    );

    expect(indexRoute).toContain('to: "/events"');
    expect(authQueries).toContain("orpc.session.getDashboardSession.queryOptions");
    expect(authQueries).toContain("orpc.session.getAuthBootstrap.queryOptions");
    expect(dashboardRoute).toContain("ensureDashboardSession");
    expect(dashboardRoute).toContain("throw redirect({");
    expect(dashboardRoute).toContain('to: "/login"');
    expect(loginRoute).toContain("authBootstrapQueryOptions()");
    expect(loginRoute).toContain('to: "/setup"');
    expect(setupRoute).toContain("authBootstrapQueryOptions()");
    expect(setupRoute).toContain('to: "/login"');
  });

  it("distinguishes an unauthorised session from a missing one", () => {
    const dashboardRoute = readFileSync(path.join(routesDir, "_dashboard.tsx"), "utf8");
    const loginRoute = readFileSync(path.join(routesDir, "login.tsx"), "utf8");
    const setupRoute = readFileSync(path.join(routesDir, "setup.tsx"), "utf8");
    const authQueries = readFileSync(
      path.join(srcDir, "features/auth/api/auth.queries.ts"),
      "utf8",
    );

    // The probe must be able to fail with FORBIDDEN, which is what lets a caller
    // tell "sign in" apart from "signing in will not help".
    expect(authQueries).toContain("isForbiddenSessionError");

    // Every route that probes the session must tolerate that failure, otherwise
    // a signed-in-but-unauthorised user cannot reach the one page that lets them
    // switch accounts, or create the first owner.
    for (const [name, source] of [
      ["_dashboard", dashboardRoute],
      ["login", loginRoute],
      ["setup", setupRoute],
    ] as const) {
      expect(source, `${name} must handle a forbidden session`).toContain(
        "isForbiddenSessionError",
      );
    }

    // And the dashboard must render that state rather than redirecting to login,
    // because a redirect would bounce the user in a loop.
    expect(dashboardRoute).toContain("DashboardForbiddenPage");
  });
});

/** Splits one feature router file into `name: os.<feature>.<procedure>` chunks. */
function procedureSources(source: string): Array<{ name: string; source: string }> {
  const matches = [...source.matchAll(/^ {2}(\w+): os\./gm)];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const next = matches[index + 1];
    const end = next?.index ?? source.length;

    return {
      name: match[1]!,
      source: source.slice(start, end),
    };
  });
}
