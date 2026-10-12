import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import type { RPCClient } from "@tocsin/api/client";

import { router } from "#/server/orpc/router";

const getRpcClient = createIsomorphicFn()
  .server((): RPCClient =>
    createRouterClient(router, {
      context: async () => ({
        reqHeaders: getRequestHeaders(),
      }),
    }),
  )
  .client((): RPCClient => {
    const link = new RPCLink({
      url: "/api",
    });

    return createORPCClient(link);
  });

export const rpcClient: RPCClient = getRpcClient();

export const orpc = createTanstackQueryUtils(rpcClient);
