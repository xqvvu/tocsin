import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";

import { router } from "#/server/orpc/router";

export const openAPIGenerator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

export async function generateOpenAPISpecs() {
  return await openAPIGenerator.generate(router, {
    base: {
      info: {
        title: "Tocsin API",
        version: "0.1.0",
      },
      servers: [{ url: "/api/openapi" }],
    },
  });
}
