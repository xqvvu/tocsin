import { getRequestHeaders } from "@tanstack/react-start/server";

import { getApplicationContainer, type ApplicationContainer } from "#/server/runtime/container";
import {
  DashboardAuthError,
  DashboardAuthorizationError,
  type DashboardSession,
  type GetDashboardSession,
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
  const session = await (options.getSession ?? getBetterAuthSession)({
    headers: context.headers,
  });

  if (!session) {
    throw new DashboardAuthError();
  }

  if (!isDashboardAdminRole(session.user.role)) {
    throw new DashboardAuthorizationError();
  }

  return {
    ...context,
    dashboardSession: session,
    currentUser: session.user,
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

async function getBetterAuthSession(input: { headers: HeadersInit }) {
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
