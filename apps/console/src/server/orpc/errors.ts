import { type AnyORPCError, ORPCError } from "@orpc/server";
import { z } from "zod";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import {
  DeliveryAlreadyAcceptedError,
  InvalidDeliveryStateError,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
import { DomainValidationError } from "#/server/runtime/domain-errors";

/**
 * Maps domain failures thrown by capability services onto typed oRPC errors.
 *
 * Without this, anything a service throws reaches the browser as an opaque
 * `INTERNAL_SERVER_ERROR` with the message stripped. That is wrong for the
 * console's everyday failures: a missing destination, malformed import TOML, or
 * an illegal delivery state are operator-actionable outcomes, not server faults.
 *
 * The codes chosen are the ones a dashboard can act on. `NOT_FOUND` is declared
 * on the contracts that can raise it; `BAD_REQUEST` and `CONFLICT` map to the
 * right HTTP status even where the contract does not enumerate them, they are
 * just not part of the typed error set a client can narrow on.
 *
 * Returns `null` when the error is not a recognised domain failure, so callers
 * rethrow the original value and genuinely unexpected faults stay 500s.
 */
export function toContractError(error: unknown): AnyORPCError | null {
  if (error instanceof ORPCError) {
    return error;
  }

  if (error instanceof RecordNotFoundError) {
    return new ORPCError("NOT_FOUND", {
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof DomainValidationError) {
    return new ORPCError("BAD_REQUEST", {
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof z.ZodError) {
    return new ORPCError("BAD_REQUEST", {
      message: describeZodIssues(error),
      cause: error,
    });
  }

  if (error instanceof InvalidDeliveryStateError) {
    return new ORPCError("CONFLICT", {
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof DeliveryAlreadyAcceptedError) {
    return new ORPCError("CONFLICT", {
      message: error.message,
      cause: error,
    });
  }

  return null;
}

/**
 * Renders zod issues as `path: message` lines. The default `ZodError.message`
 * is a JSON array dump, which is not presentable in a console toast.
 */
function describeZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
