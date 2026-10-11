import { implement, os as base } from "@orpc/server";

import { contract } from "@tocsin/api";

import { toContractError } from "#/server/orpc/errors";
import { requestId } from "#/server/orpc/middlewares/request-id";
import { procedureLogging } from "#/server/orpc/procedure-logging";

/**
 * Translates domain failures into typed oRPC errors.
 *
 * Registered at the root so every procedure inherits it, including public ones,
 * and inside `procedureLogging` so the logged code is always the translated
 * `ORPCError.code`. The middleware declares no error map on purpose: keeping
 * the translation out of the contract's error keys means public procedures such
 * as `health.check` do not inherit NOT_FOUND/CONFLICT just because a service
 * can raise them.
 */
const translateErrors = base.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    throw toContractError(error) ?? error;
  }
});

/**
 * The console's single contract implementer.
 *
 * `implement(contract)` binds the API shape from `@tocsin/api`, so a procedure
 * name that is missing or extra is a type error rather than a runtime 404. The
 * shared middleware chain is procedure logging, then error translation, then
 * request id. Logging sits outermost so it also records failures raised by
 * `translateErrors` and `requestId`, and sees their already-translated
 * `ORPCError` codes.
 */
export const os = implement(contract).use(procedureLogging()).use(translateErrors).use(requestId());
