import "@tanstack/react-start/server-only";
import type { BetterAuthOptions } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

/**
 * Shared Better Auth options.
 *
 * Deliberately unannotated: an explicit `BetterAuthOptions` return type erases
 * the literal shape of `user.additionalFields`, and with it the inferred type
 * of a session's `user.role`. Letting TypeScript infer the literal object keeps
 * `$Infer.Session` exact, which is what the session type below is derived from
 * (see `dashboard-session.ts`).
 */
export function createBaseBetterAuthOptions() {
  return {
    advanced: {
      database: {
        generateId: "uuid",
      },
    },
    user: {
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      additionalFields: {
        role: {
          type: ["owner", "admin", "member"],
          required: true,
          defaultValue: "member",
          input: false,
        },
      },
    },
    session: {
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
    },
    account: {
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    plugins: [tanstackStartCookies()],
  } satisfies BetterAuthOptions;
}
