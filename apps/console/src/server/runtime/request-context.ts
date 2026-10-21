import "@tanstack/react-start/server-only";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { getApplicationContainer, type ApplicationContainer } from "#/server/runtime/container";
import {
  DashboardAuthError,
  DashboardAuthorizationError,
  type BetterAuthSession,
  type DashboardSession,
  type GetDashboardSession,
  toDashboardSession,
} from "#/server/runtime/dashboard-session";

export interface RequestContextOptions {
  container?: ApplicationContainer;
  headers?: HeadersInit;
  now?: () => string;
}

export interface BaseRequestContext {
  container: ApplicationContainer;
  headers: Headers;
  headersRecord: Record<string, string>;
  requestId: string | null;
  now: string;
}

export interface DashboardRequestContext extends BaseRequestContext {
  dashboardSession: DashboardSession;
  currentUser: DashboardSession["user"];
}

export interface WebhookRequestContext extends BaseRequestContext {
  sourceToken: string | null;
  hasProviderSecret: boolean;
}

export async function requireDashboardRequestContext(
  options: RequestContextOptions & {
    getSession?: GetDashboardSession;
  } = {},
): Promise<DashboardRequestContext> {
  const context = createBaseRequestContext(options);

  // The resolver always yields Better Auth's session, never a pre-projected one:
  // projection happens in exactly one place below, so there is no path where an
  // un-projected session (with its token) reaches a procedure.
  const resolveSession = options.getSession ?? getBetterAuthSession;
  const session = await resolveSession({ headers: context.headers });

  if (!session) {
    throw new DashboardAuthError();
  }

  // Authorisation reads Better Auth's own value, before projection, so the role
  // check cannot be affected by what the projection chooses to expose.
  if (!isDashboardAdminRole(session.user.role)) {
    throw new DashboardAuthorizationError();
  }

  const dashboardSession = toDashboardSession(session);

  return {
    ...context,
    dashboardSession,
    currentUser: dashboardSession.user,
  };
}

export function createWebhookRequestContext(
  options: RequestContextOptions & {
    request?: Request;
  } = {},
): WebhookRequestContext {
  const headers = options.request?.headers ?? options.headers;
  const context = createBaseRequestContext({
    ...options,
    headers,
  });

  return {
    ...context,
    sourceToken: readBearerToken(context.headers) ?? context.headers.get("x-tocsin-source-token"),
    hasProviderSecret: context.headers.has("x-tocsin-provider-secret"),
  };
}

export function createBaseRequestContext(options: RequestContextOptions = {}): BaseRequestContext {
  const headers = new Headers(options.headers ?? getRequestHeaders());

  return {
    container: options.container ?? getApplicationContainer(),
    headers,
    headersRecord: Object.fromEntries(headers.entries()),
    requestId: readRequestId(headers),
    now: (options.now ?? (() => new Date().toISOString()))(),
  };
}

async function getBetterAuthSession(input: {
  headers: HeadersInit;
}): Promise<BetterAuthSession | null> {
  return (await getApplicationContainer().getAuth()).api.getSession(input);
}

function readRequestId(headers: Headers): string | null {
  return headers.get("x-request-id") ?? headers.get("x-correlation-id");
}

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");

  if (authorization?.toLocaleLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return null;
}

function isDashboardAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
