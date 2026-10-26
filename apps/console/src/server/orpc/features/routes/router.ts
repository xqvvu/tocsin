import { withDashboardService } from "#/server/orpc/middlewares/require-dashboard";
import { os } from "#/server/orpc/os";

/** Route rule administration. */
const withRouteService = withDashboardService((container) => container.createRouteService());

export const routesRouter = os.routes.router({
  list: os.routes.list.use(withRouteService).handler(({ context }) => context.service.listRoutes()),

  create: os.routes.create
    .use(withRouteService)
    .handler(({ context, input }) => context.service.createRoute(input)),

  update: os.routes.update
    .use(withRouteService)
    .handler(({ context, input }) => context.service.updateRoute(input)),

  previewDelete: os.routes.previewDelete
    .use(withRouteService)
    .handler(({ context, input }) => context.service.previewDeleteRoute(input)),

  delete: os.routes.delete
    .use(withRouteService)
    .handler(({ context, input }) => context.service.deleteRoute(input)),
});
