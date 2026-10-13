import { withDashboardService } from "#/server/orpc/middlewares/require-dashboard";
import { os } from "#/server/orpc/os";

/** Suppression rule administration. */
const withSuppressionService = withDashboardService((container) =>
  container.createSuppressionService(),
);

export const suppressionsRouter = os.suppressions.router({
  list: os.suppressions.list
    .use(withSuppressionService)
    .handler(({ context }) => context.service.listSuppressions()),

  get: os.suppressions.get
    .use(withSuppressionService)
    .handler(({ context, input }) => context.service.getSuppression(input.id)),

  hits: os.suppressions.hits
    .use(withSuppressionService)
    .handler(({ context, input }) => context.service.listSuppressionHits(input)),

  create: os.suppressions.create
    .use(withSuppressionService)
    .handler(({ context, input }) => context.service.createSuppression(input)),

  update: os.suppressions.update
    .use(withSuppressionService)
    .handler(({ context, input }) => context.service.updateSuppression(input)),

  setEnabled: os.suppressions.setEnabled
    .use(withSuppressionService)
    .handler(({ context, input }) => context.service.setSuppressionEnabled(input)),

  delete: os.suppressions.delete
    .use(withSuppressionService)
    .handler(({ context, input }) => context.service.deleteSuppression(input)),
});
