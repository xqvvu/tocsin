import { describe, expect, it } from "vite-plus/test";

import { contract } from "@tocsin/api/contract";

import { generateOpenAPISpecs } from "#/server/orpc/openapi";

/**
 * Guards the OpenAPI surface's request shape.
 *
 * The console deliberately declares **no** HTTP methods on its procedures, so
 * every one of them uses oRPC's default (`DEFAULT_OPENAPI_METHOD`, which is
 * `POST`). Two consequences are worth pinning down, because both were previously
 * false and both cost real debugging time:
 *
 * 1. Inputs travel in the JSON request body, not as query parameters. A
 *    procedure with no declared method therefore never has to cope with a
 *    query string, where every value arrives as a string. That is why the
 *    `z.coerce.number()` workarounds these fields once carried could be removed:
 *    they existed only to make a documented `?limit=20` survive a form that
 *    could not represent a number.
 *
 * 2. Re-declaring a method would silently reintroduce (1). If someone adds
 *    `method: "GET"` to a procedure with a non-string input, external callers
 *    get a 400 that the dashboard cannot see — the RPC client keeps posting
 *    JSON and stays green. This test fails first.
 */

type OrpcMeta = {
  meta?: { "~openapi"?: { method?: string } };
  inputSchemas?: unknown[];
};

function procedures(): Array<{ path: string; method: string | undefined; input?: unknown }> {
  const found: Array<{ path: string; method: string | undefined; input?: unknown }> = [];

  const walk = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const orpc = rec["~orpc"] as OrpcMeta | undefined;

    if (orpc && path.length > 0) {
      found.push({
        path: path.join("."),
        method: orpc.meta?.["~openapi"]?.method,
        input: orpc.inputSchemas?.[0],
      });
      return;
    }

    for (const [key, value] of Object.entries(rec)) walk(value, [...path, key]);
  };

  walk(contract, []);
  return found;
}

describe("OpenAPI request shape", () => {
  it("finds the procedures it is meant to guard", () => {
    const all = procedures();

    // Without this the rest of the suite would pass vacuously if the contract
    // shape changed and the walk stopped matching.
    expect(all.length).toBeGreaterThan(0);
    expect(all.map((p) => p.path)).toContain("operations.list");
  });

  it("declares no HTTP method, so every procedure keeps oRPC's POST default", () => {
    const declared = procedures()
      .filter((p) => p.method !== undefined)
      .map((p) => `${p.path} -> ${p.method}`);

    expect(
      declared,
      "A procedure declares an OpenAPI method. The console is POST-only by " +
        "design: inputs belong in the JSON body, and a GET would move them into " +
        "a query string where a non-string field cannot survive. If a method is " +
        "genuinely needed, the input schema has to be checked for fields that a " +
        "query string cannot carry.",
    ).toEqual([]);
  });

  it("generates POST + JSON request bodies, with no query params", async () => {
    const spec = await generateOpenAPISpecs();

    const paths = spec.paths;
    expect(paths).toBeDefined();

    for (const path of [
      "/operations/list",
      "/operations/getEventDetail",
      "/portability/exportToml",
    ] as const) {
      const operations = paths![path];
      if (!operations) throw new Error(`missing OpenAPI path ${path}`);

      expect(Object.keys(operations)).toEqual(["post"]);
      const post = operations.post;
      if (!post) throw new Error(`missing POST operation for ${path}`);
      expect(post.requestBody, `${path} input should travel in the body`).toBeDefined();
      expect(post.parameters ?? [], `${path} should not encode input in the URL`).toEqual([]);
    }
  });

  it("accepts a real number on an input that used to need coercion", () => {
    // The point of dropping the methods: `limit` is a number again, not a
    // widened `unknown` that also tolerates "2".
    const list = procedures().find((p) => p.path === "operations.list")?.input as
      | { parse: (value: unknown) => unknown }
      | undefined;

    expect(list?.parse, "operations.list input schema not found").toBeTypeOf("function");
    expect(list!.parse({ limit: 2 })).toMatchObject({ limit: 2 });
    expect(list!.parse({ eventPage: 2 })).toMatchObject({ eventPage: 2 });
    expect(list!.parse({})).toMatchObject({ limit: 20, eventPage: 1 });
  });

  it("rejects a string where a number belongs", () => {
    const list = procedures().find((p) => p.path === "operations.list")?.input as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    // A JSON body can carry a real number, so a string is now simply wrong —
    // previously coercion had to accept it, which hid genuine client mistakes.
    expect(list!.safeParse({ limit: "2" }).success).toBe(false);
  });

  it("keeps includeSecrets falseable-only", () => {
    const portability = procedures().find((p) => p.path === "portability.exportToml")?.input as
      | { safeParse: (value: unknown) => { success: boolean } }
      | undefined;

    expect(portability?.safeParse, "portability.exportToml input not found").toBeTypeOf("function");
    expect(portability!.safeParse({ includeSecrets: false }).success).toBe(true);
    // `true` must stay unrepresentable: "include secrets" cannot be requested
    // at all, so no caller can opt into leaking them.
    expect(portability!.safeParse({ includeSecrets: true }).success).toBe(false);
  });
});
