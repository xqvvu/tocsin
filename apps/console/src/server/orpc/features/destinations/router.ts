import { withDashboardService } from "#/server/orpc/middlewares/require-dashboard";
import { os } from "#/server/orpc/os";

/**
 * Outbound destination administration.
 *
 * These handlers stay thin on purpose: the middleware resolves the capability
 * service from the request-scoped container and the handler delegates to it.
 * Config validation, template rendering, and secret handling belong to the
 * service.
 */
const withDestinationService = withDashboardService((container) =>
  container.createDestinationService(),
);

export const destinationsRouter = os.destinations.router({
  list: os.destinations.list
    .use(withDestinationService)
    .handler(({ context }) => context.service.listDestinations()),

  listCatalog: os.destinations.listCatalog
    .use(withDestinationService)
    .handler(({ context }) => context.service.listDestinationCatalog()),

  getTemplateDraft: os.destinations.getTemplateDraft
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.getDestinationTemplateDraft(input)),

  create: os.destinations.create
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.createDestination(input)),

  update: os.destinations.update
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.updateDestination(input)),

  previewDelete: os.destinations.previewDelete
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.previewDeleteDestination(input)),

  previewEnable: os.destinations.previewEnable
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.previewEnableDestination(input)),

  delete: os.destinations.delete
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.deleteDestination(input)),

  test: os.destinations.test
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.testDestination(input)),

  preview: os.destinations.preview
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.previewDestination(input)),

  previewDraft: os.destinations.previewDraft
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.previewDestinationDraft(input)),

  previewUpdate: os.destinations.previewUpdate
    .use(withDestinationService)
    .handler(({ context, input }) => context.service.previewDestinationUpdate(input)),
});
