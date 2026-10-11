import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import {
  CORSHandlerPlugin,
  RequestHeadersHandlerPlugin,
  ResponseHeadersHandlerPlugin,
} from "@orpc/server/plugins";

import { generateOpenAPISpecs } from "#/server/orpc/openapi";
import { router } from "#/server/orpc/router";

/**
 * RPC-protocol handler used by the browser client (`RPCLink` in
 * `#/lib/orpc.ts`) and exposed on `/api/rpc`.
 *
 * The RPC protocol is what makes `orpc.*.queryOptions()` / `mutationOptions()`
 * work from the client without generating a typed client per procedure.
 *
 * Procedure failures are logged through LogTape, not here: the root
 * `procedureLogging()` middleware on `os` records translated codes with the
 * request id and safe error properties, and transport-level faults (malformed
 * bodies, unmatched procedures) surface as 4xx in the HTTP access log written
 * by `middlewares/request-logging.middleware.ts`. A `console.error` interceptor
 * would bypass redaction and correlation, so it is deliberately absent.
 */
export const rpcHandler = new RPCHandler(router, {
  plugins: [
    new CORSHandlerPlugin({
      allowHeaders: ["Content-Disposition"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
    new RequestHeadersHandlerPlugin(),
    new ResponseHeadersHandlerPlugin(),
  ],
});

/**
 * OpenAPI handler mounted on a separate prefix.
 *
 * The RPC and OpenAPI protocols are not interchangeable: an `RPCLink` client
 * sends `{"json": ...}` envelopes that only the RPC codec can decode, while
 * `OpenAPIHandler` matches by HTTP method and path. Both handlers share the
 * same router, so the OpenAPI surface documents exactly what the app serves.
 */
export const openAPIHandler = new OpenAPIHandler(router, {
  plugins: [
    new CORSHandlerPlugin({
      allowHeaders: ["Content-Disposition"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
    new RequestHeadersHandlerPlugin(),
    new ResponseHeadersHandlerPlugin(),
    new OpenAPIReferenceHandlerPlugin({
      spec: generateOpenAPISpecs,
      specPath: "/spec.json",
      docsPath: "/docs",
      docsTitle: "Tocsin API",
    }),
  ],
});
