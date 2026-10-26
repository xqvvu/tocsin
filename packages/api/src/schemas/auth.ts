import { IsoDateTimeSchema } from "@tocsin/core";
import * as z from "zod";

/**
 * Dashboard session projection.
 *
 * Only identity fields the console renders. Session identifiers, tokens, and
 * anything the auth runtime keeps server-side never cross this boundary.
 */
export const DashboardSessionOutputSchema = z
  .object({
    user: z.object({
      id: z.string().min(1),
      name: z.string().nullable(),
      email: z.string().min(1),
      image: z.string().nullable(),
      role: z.string().nullable(),
    }),
  })
  .nullable();

/** Whether the instance still needs its first owner account. */
export const AuthBootstrapOutputSchema = z.object({
  setupRequired: z.boolean(),
});

/**
 * One live dashboard session.
 *
 * Built by naming the columns the account-security panel renders. The session
 * token and hash stay in SQLite: the projection is by omission, so a column the
 * auth runtime adds later cannot leak by default. `current` marks the session
 * the request was authenticated with, which lets the console label it instead
 * of offering an action that would sign the operator out mid-incident.
 */
export const ActiveSessionSummarySchema = z.object({
  id: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  // Not `min(1)`: the auth runtime may store an empty string when the proxy
  // forwarded no address, and one odd row must not turn the whole list into a
  // 500 at the output boundary. The panel renders empty as "unknown".
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});

export const ActiveSessionsOutputSchema = z.object({
  sessions: z.array(ActiveSessionSummarySchema),
});

export type ActiveSessionSummary = z.infer<typeof ActiveSessionSummarySchema>;
export type ActiveSessionsOutput = z.infer<typeof ActiveSessionsOutputSchema>;

/** Result of signing out every other session of the signed-in account. */
export const RevokeOtherSessionsOutputSchema = z.object({
  status: z.boolean(),
});

export type RevokeOtherSessionsOutput = z.infer<typeof RevokeOtherSessionsOutputSchema>;
