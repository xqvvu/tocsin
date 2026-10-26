import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { CreateSourceCommandSchema } from "@tocsin/core";

import { RecordNotFoundError } from "#/infra/sqlite/errors";
import {
  DeliveryAlreadyAcceptedError,
  InvalidDeliveryStateError,
} from "#/infra/sqlite/repositories/delivery/delivery.interface";
import type { ApplicationContainer } from "#/server/runtime/container";
import { DomainValidationError } from "#/server/runtime/domain-errors";

const fakeContainer = {
  createSourceService: async () => ({
    listSources: async () => {
      throw new RecordNotFoundError("Source", "source-missing");
    },
  }),
  createOperationsService: async () => ({
    retryDelivery: async (deliveryId: string) => {
      if (deliveryId === "delivery-accepted") {
        throw new DeliveryAlreadyAcceptedError(deliveryId);
      }
      throw new InvalidDeliveryStateError(deliveryId, "succeeded", "retry");
    },
  }),
  createSuppressionService: async () => ({
    getSuppression: async () => {
      throw new RecordNotFoundError("Suppression", "suppression-missing");
    },
    createSuppression: async () => {
      throw new DomainValidationError("A suppression must end after it starts");
    },
  }),
  getAuth: async () => ({
    handler: async () => new Response(null),
    api: {
      getSession: async () => ({
        session: { id: "session-1", userId: "user-1" },
        user: { id: "user-1", email: "owner@example.test", role: "owner" },
      }),
    },
  }),
} as unknown as ApplicationContainer;

vi.mock("#/server/runtime/container", () => ({
  getApplicationContainer: () => fakeContainer,
}));

const { rpcHandler } = await import("#/server/orpc/handler");

const authenticatedHeaders = {
  "content-type": "application/json",
  cookie: "better-auth.session_token=token",
};

/** Calls one procedure through the real RPC handler, as the browser would. */
async function callProcedure(
  path: string,
  input: unknown,
): Promise<{ status: number; body: { code?: string; message?: string } }> {
  const { response } = await rpcHandler.handle(
    new Request(`http://localhost/api/${path}`, {
      method: "POST",
      headers: authenticatedHeaders,
      body: JSON.stringify({ json: input }),
    }),
    { prefix: "/api" },
  );

  const payload = (await response!.json()) as { json: { code?: string; message?: string } };

  return { status: response!.status, body: payload.json };
}

describe("oRPC domain error translation", () => {
  it("maps a missing record to NOT_FOUND with the domain message intact", async () => {
    const { status, body } = await callProcedure("sources/list", undefined);

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Source not found: source-missing");
  });

  it("maps an illegal delivery state to CONFLICT", async () => {
    const { status, body } = await callProcedure("operations/retryDelivery", { id: "delivery-1" });

    expect(status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toBe("Cannot retry delivery delivery-1 while it is succeeded");
  });

  it("maps a retry of an already accepted delivery to CONFLICT", async () => {
    const { status, body } = await callProcedure("operations/retryDelivery", {
      id: "delivery-accepted",
    });

    expect(status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toBe(
      "Delivery delivery-accepted was already accepted by the destination; " +
        "retrying it would send the alert again",
    );
  });

  it("maps a missing suppression rule to NOT_FOUND through the new namespace", async () => {
    const { status, body } = await callProcedure("suppressions/get", { id: "suppression-missing" });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Suppression not found: suppression-missing");
  });

  it("maps an invalid suppression window to BAD_REQUEST", async () => {
    const { status, body } = await callProcedure("suppressions/create", {
      name: "Backwards",
      kind: "silence",
      startsAt: "2026-10-12T11:00:00.000Z",
      endsAt: "2026-10-12T09:00:00.000Z",
    });

    expect(status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.message).toBe("A suppression must end after it starts");
  });

  it("leaves unknown failures as internal errors", async () => {
    const container = fakeContainer as unknown as {
      createSourceService: () => Promise<{ listSources: () => Promise<never> }>;
    };
    container.createSourceService = async () => ({
      listSources: async () => {
        throw new Error("socket hang up");
      },
    });

    const { status, body } = await callProcedure("sources/list", undefined);

    expect(status).toBe(500);
    expect(body.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("maps service schema validation to BAD_REQUEST with a readable message", async () => {
    const container = fakeContainer as unknown as {
      createSourceService: () => Promise<{ listSources: () => Promise<never> }>;
    };
    container.createSourceService = async () => ({
      listSources: async () => {
        await CreateSourceCommandSchema.parseAsync({ name: "" });
        throw new Error("unreachable");
      },
    });

    const { status, body } = await callProcedure("sources/list", undefined);

    expect(status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.message).toContain("name:");
  });

  it("keeps a typed oRPC error thrown by a service unchanged", async () => {
    const container = fakeContainer as unknown as {
      createSourceService: () => Promise<{ listSources: () => Promise<never> }>;
    };
    container.createSourceService = async () => ({
      listSources: async () => {
        throw new ORPCError("TOO_MANY_REQUESTS", { message: "slow down" });
      },
    });

    const { status, body } = await callProcedure("sources/list", undefined);

    expect(status).toBe(429);
    expect(body.code).toBe("TOO_MANY_REQUESTS");
    expect(body.message).toBe("slow down");
  });
});
