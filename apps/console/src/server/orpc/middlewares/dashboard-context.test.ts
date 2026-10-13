import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { findDashboardContext } from "#/server/orpc/middlewares/dashboard-context";

const hoisted = vi.hoisted(() => ({
  requireDashboardRequestContext: vi.fn(),
}));

vi.mock("#/server/runtime/request-context", () => ({
  requireDashboardRequestContext: hoisted.requireDashboardRequestContext,
}));

/**
 * The distinction under test is the whole point of this module: "no session"
 * and "session without access" used to collapse into the same `null`, which made
 * a signed-in member look like a signed-out visitor and got them redirected to
 * the login page in a loop.
 */
describe("findDashboardContext", () => {
  it("returns null when there is no session", async () => {
    hoisted.requireDashboardRequestContext.mockRejectedValue(
      new ORPCError("UNAUTHORIZED", { message: "nope" }),
    );

    await expect(findDashboardContext({})).resolves.toBeNull();
  });

  it("propagates FORBIDDEN instead of folding it into null", async () => {
    hoisted.requireDashboardRequestContext.mockRejectedValue(
      new ORPCError("FORBIDDEN", { message: "not an owner" }),
    );

    // The assertion is on the *code*, because that is what callers branch on to
    // tell "sign in" apart from "you cannot use this".
    await expect(findDashboardContext({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("propagates unexpected failures untouched", async () => {
    const boom = new Error("database is on fire");
    hoisted.requireDashboardRequestContext.mockRejectedValue(boom);

    await expect(findDashboardContext({})).rejects.toBe(boom);
  });

  it("returns the context when the session is valid", async () => {
    const context = { requestId: "r1" };
    hoisted.requireDashboardRequestContext.mockResolvedValue(context);

    await expect(findDashboardContext({})).resolves.toBe(context);
  });
});
