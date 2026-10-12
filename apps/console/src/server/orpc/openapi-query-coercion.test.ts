import { describe, expect, it } from "vite-plus/test";

import { contract } from "@tocsin/api/contract";

/**
 * Guards the OpenAPI surface's query-string contract.
 *
 * The dashboard talks to `/api` over the RPC protocol, which can carry real
 * JSON, so a number stays a number. The OpenAPI surface at `/api/openapi` is
 * what external callers use, and on a `GET` every value arrives as a string,
 * because that is all a query string can carry.
 *
 * Any non-string field on a `GET` procedure's input is therefore a trap: the
 * generated reference documents `?limit=20`, but a bare `z.number()` rejects it
 * with "expected number, received string" before auth even runs. That is what
 * happened to all four of these, while their string-valued siblings reached the
 * auth layer (401):
 *
 *   operations.list?limit=2                          -> 400
 *   operations.list?eventPage=2                      -> 400
 *   operations.previewRouteReplay?routeId=…&limit=…  -> 400
 *   portability.exportToml?includeSecrets=false      -> 400
 *
 * This test is worth having because the failure is invisible from the dashboard:
 * the RPC client keeps working (it posts JSON), and only external callers see
 * the 400. A future non-string field added to a `GET` input would otherwise ship
 * silently.
 */

type ZodDef = {
  type?: string;
  coerce?: boolean;
  innerType?: unknown;
  options?: unknown[];
  shape?: Record<string, unknown>;
  element?: unknown;
  /** `pipe`: `.transform()` wraps a schema as `{ in, out }`. */
  in?: unknown;
  /** `literal`: the values the field accepts. */
  values?: unknown[];
};

function defOf(schema: unknown): ZodDef | undefined {
  return (schema as { def?: ZodDef } | undefined)?.def;
}

/** Peels wrappers (`default` / `optional` / `nullable`) to reach the real type. */
function unwrap(schema: unknown): { schema: unknown; def: ZodDef | undefined } {
  let current = schema;
  for (;;) {
    const def = defOf(current);
    if (!def) return { schema: current, def: undefined };
    if (
      (def.type === "default" || def.type === "optional" || def.type === "nullable") &&
      def.innerType
    ) {
      current = def.innerType;
      continue;
    }
    // `.transform()` produces a pipe; the query-string question is about what
    // the *input* side accepts, so look through to it.
    if (def.type === "pipe" && def.in) {
      current = def.in;
      continue;
    }
    return { schema: current, def };
  }
}

/** Collects every non-string leaf in a schema tree, with its path. */
function nonStringLeaves(schema: unknown, path: string[] = []): string[] {
  const { def } = unwrap(schema);
  if (!def) return [];

  switch (def.type) {
    case "string":
    case "enum":
      return [];
    case "literal": {
      // `z.literal(false)` cannot be expressed in a query string; only a
      // string-valued literal can. Accept it when the field also admits the
      // string spelling — handled by the `union` branch below.
      const values = def.values ?? [];
      return values.every((value) => typeof value === "string") ? [] : [path.join(".") || "(root)"];
    }
    case "number":
    case "boolean":
    case "bigint":
      // Acceptable only when it declares coercion — that is precisely what
      // makes a query-string spelling parseable.
      return def.coerce ? [] : [path.join(".") || "(root)"];
    case "object": {
      const out: string[] = [];
      for (const [key, value] of Object.entries(def.shape ?? {})) {
        out.push(...nonStringLeaves(value, [...path, key]));
      }
      return out;
    }
    case "array":
      return nonStringLeaves(def.element, [...path, "[]"]);
    case "union": {
      // A union is safe when at least one branch is expressible in a query
      // string, e.g. `z.union([z.literal(false), z.literal("false")])` — the
      // caller writes `?includeSecrets=false` and the string branch matches.
      const branches = def.options ?? [];
      const anySafe = branches.some((option) => nonStringLeaves(option, path).length === 0);
      return anySafe ? [] : [path.join(".") || "(root)"];
    }
    default:
      // Anything unrecognised is reported, so a new Zod type cannot sneak past
      // by not being in the switch.
      return [path.join(".") || "(root)"];
  }
}

type OrpcMeta = {
  meta?: { "~openapi"?: { method?: string } };
  inputSchemas?: unknown[];
};

function getProcedures(): Array<{ path: string; input?: unknown; method?: string }> {
  const found: Array<{ path: string; input?: unknown; method?: string }> = [];

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

describe("OpenAPI query-string inputs", () => {
  it("finds the GET procedures it is meant to guard", () => {
    const gets = getProcedures().filter((p) => p.method === "GET");
    // Without this the whole suite would pass vacuously if the contract shape
    // changed and the walk stopped matching.
    expect(gets.length).toBeGreaterThan(0);
    expect(gets.map((p) => p.path)).toContain("operations.list");
  });

  it("no GET procedure declares a bare non-string input field", () => {
    const offenders: string[] = [];

    for (const procedure of getProcedures()) {
      if (procedure.method !== "GET" || procedure.input === undefined) continue;
      for (const leaf of nonStringLeaves(procedure.input)) {
        offenders.push(`${procedure.path}.${leaf}`);
      }
    }

    // Declare them with `z.coerce.number()` (or an explicit union that admits
    // the string spelling), as oRPC's docs prescribe for query params — a bare
    // `z.number()` makes the documented `?limit=20` a 400 before auth runs.
    expect(offenders).toEqual([]);
  });

  it("operations.list parses the documented query-string spellings", () => {
    const schema = getProcedures().find((p) => p.path === "operations.list")?.input as
      | { parse: (value: unknown) => unknown }
      | undefined;
    expect(schema?.parse, "operations.list input schema not found").toBeTypeOf("function");

    expect(schema!.parse({ limit: "2" })).toMatchObject({ limit: 2 });
    expect(schema!.parse({ eventPage: "2" })).toMatchObject({ eventPage: 2 });
    // Omitted fields still take their defaults.
    expect(schema!.parse({})).toMatchObject({ limit: 20, eventPage: 1 });
  });

  it("portability.exportToml accepts the query-string spelling of includeSecrets", () => {
    const schema = getProcedures().find((p) => p.path === "portability.exportToml")?.input as
      | { parse: (value: unknown) => unknown }
      | undefined;
    expect(schema?.parse, "portability.exportToml input schema not found").toBeTypeOf("function");

    // `?includeSecrets=false` is a string on the wire and must normalise to false.
    // `z.coerce.boolean()` would be wrong here: Boolean("false") is true, which
    // would read an explicit "no secrets" as consent to include them.
    expect(schema!.parse({ includeSecrets: "false" })).toMatchObject({ includeSecrets: false });
    expect(schema!.parse({ includeSecrets: false })).toMatchObject({ includeSecrets: false });
    expect(() => schema!.parse({ includeSecrets: "true" })).toThrow(/includeSecrets|invalid/i);
  });
});
