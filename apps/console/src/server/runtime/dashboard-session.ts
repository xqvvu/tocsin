import "@tanstack/react-start/server-only";
import type { betterAuth } from "better-auth";

import type { createBaseBetterAuthOptions } from "#/lib/auth-options";

/**
 * The dashboard session, derived from the Better Auth instance rather than
 * hand-written.
 *
 * Better Auth is the source of truth for what a session contains, and it
 * exposes `$Infer.Session` for exactly this. Hand-writing the shape means the
 * two drift: add a field to `user.additionalFields` and nothing here would
 * fail to compile — the field would simply be dropped, silently, at the point
 * where it is copied out. Deriving it turns that into a type error.
 *
 * Note this is the *full* inferred session, which includes `session.token`.
 * That token is a server-side secret and must never reach the client; the
 * projection below is what the API is allowed to return, and it is defined by
 * omission so a new secret field cannot leak by default.
 */
type InferredAuth = ReturnType<typeof betterAuth<ReturnType<typeof createBaseBetterAuthOptions>>>;
export type BetterAuthSession = InferredAuth["$Infer"]["Session"];

/** Identity fields the dashboard renders. */
export interface DashboardUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string | null;
}

/**
 * What `requireDashboardRequestContext` hands to procedures.
 *
 * Carries the session id and the user, and deliberately not the token: server
 * code has no use for it (the cookie is already attached to the request), and
 * holding it in a long-lived context object invites it being logged or
 * serialised by accident.
 */
export interface DashboardSession {
  session: {
    id: string;
    userId: string;
  };
  user: DashboardUser;
}

/**
 * Resolver injected into the request context. It yields Better Auth's session —
 * the thing being *checked* — not a projected one; projection is the context's
 * job, so there is exactly one place where a token could be dropped and no way
 * to hand the rest of the server an un-projected session by mistake.
 */
export type GetDashboardSession = (input: {
  headers: HeadersInit;
}) => Promise<BetterAuthSession | null>;

/**
 * Projects a Better Auth session onto the dashboard session.
 *
 * Defined by picking known-safe fields rather than deleting the token, so a
 * field added to Better Auth's session is absent here until someone
 * deliberately exposes it.
 */
export function toDashboardSession(session: BetterAuthSession): DashboardSession {
  return {
    session: {
      id: session.session.id,
      userId: session.session.userId,
    },
    user: {
      id: session.user.id,
      // Better Auth types these as `string | undefined`; the dashboard treats
      // absent and null the same, so normalise once here.
      name: session.user.name ?? null,
      email: session.user.email,
      image: session.user.image ?? null,
      role: session.user.role ?? null,
    },
  };
}

/**
 * The payload `session.getDashboardSession` is allowed to return.
 *
 * Distinct from `DashboardSession`: this is the wire shape, and it omits the
 * session identifiers as well, because the browser already knows its own
 * session and exposing internal ids buys it nothing.
 */
export interface DashboardSessionPayload {
  user: DashboardUser;
}

export function toDashboardSessionPayload(session: DashboardSession): DashboardSessionPayload {
  return { user: session.user };
}

export class DashboardAuthError extends Error {
  constructor(message = "Dashboard authentication required") {
    super(message);
    this.name = new.target.name;
  }
}

export class DashboardAuthorizationError extends Error {
  constructor(message = "Dashboard owner or admin access required") {
    super(message);
    this.name = new.target.name;
  }
}
