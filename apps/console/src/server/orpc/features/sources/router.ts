import { withDashboardService } from "#/server/orpc/middlewares/require-dashboard";
import { os } from "#/server/orpc/os";

/** Alert source (告警源) administration. Every procedure needs a dashboard session. */
const withSourceService = withDashboardService((container) => container.createSourceService());
const withSourceRehearsalService = withDashboardService((container) =>
  container.createSourceRehearsalService(),
);

export const sourcesRouter = os.sources.router({
  list: os.sources.list
    .use(withSourceService)
    .handler(({ context }) => context.service.listSources()),

  create: os.sources.create
    .use(withSourceService)
    .handler(({ context, input }) => context.service.createSource(input)),

  update: os.sources.update
    .use(withSourceService)
    .handler(({ context, input }) => context.service.updateSource(input)),

  // Read-only: replay a pasted payload through the parser and current routes.
  rehearse: os.sources.rehearse
    .use(withSourceRehearsalService)
    .handler(({ context, input }) => context.service.rehearseSource(input)),

  rotateToken: os.sources.rotateToken
    .use(withSourceService)
    .handler(({ context, input }) => context.service.rotateSourceToken(input)),

  previewDelete: os.sources.previewDelete
    .use(withSourceService)
    .handler(({ context, input }) => context.service.previewDeleteSource(input)),

  delete: os.sources.delete
    .use(withSourceService)
    .handler(({ context, input }) => context.service.deleteSource(input)),
});
