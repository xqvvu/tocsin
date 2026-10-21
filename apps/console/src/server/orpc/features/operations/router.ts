import {
  requireDashboard,
  withDashboardService,
} from "#/server/orpc/middlewares/require-dashboard";
import { os } from "#/server/orpc/os";

/**
 * Event, delivery, and replay operations.
 *
 * The procedure handlers only adapt the authenticated request to capability
 * services. Projection queries still belong to the operations capability even
 * though their persistence implementation is read-only.
 *
 * `runDeliveryWorker` needs the container itself (it assembles a one-off worker
 * and reads the runner health), so it uses the bare `requireDashboard()` guard.
 */
const withOperationsService = withDashboardService((container) =>
  container.createOperationsService(),
);
const withEventReplayService = withDashboardService((container) =>
  container.createEventReplayService(),
);

export const operationsRouter = os.operations.router({
  list: os.operations.list
    .use(withOperationsService)
    .handler(({ context, input }) => context.service.listOperations(input)),

  getEventDetail: os.operations.getEventDetail
    .use(withOperationsService)
    .handler(({ context, input }) => context.service.getEventDetail(input.id)),

  getDeliveryDetail: os.operations.getDeliveryDetail
    .use(withOperationsService)
    .handler(({ context, input }) => context.service.getDeliveryDetail(input.id)),

  getDeliveryBacklog: os.operations.getDeliveryBacklog
    .use(withOperationsService)
    .handler(({ context }) => context.service.getDeliveryBacklog()),

  retryDelivery: os.operations.retryDelivery
    .use(withOperationsService)
    .handler(({ context, input }) => context.service.retryDelivery(input.id)),

  // The operator is taken from the authenticated session, never from the input.
  buzzDelivery: os.operations.buzzDelivery
    .use(withOperationsService)
    .handler(({ context, input }) =>
      context.service.buzzDelivery(input.id, context.dashboardRequest.currentUser.id),
    ),

  previewEventReplay: os.operations.previewEventReplay
    .use(withEventReplayService)
    .handler(({ context, input }) => context.service.previewEventReplay(input)),

  replayEvent: os.operations.replayEvent
    .use(withEventReplayService)
    .handler(({ context, input }) => context.service.replayEvent(input)),

  previewRouteReplay: os.operations.previewRouteReplay
    .use(withEventReplayService)
    .handler(({ context, input }) => context.service.previewRouteReplay(input)),

  replayRouteEvents: os.operations.replayRouteEvents
    .use(withEventReplayService)
    .handler(({ context, input }) => context.service.replayRouteEvents(input)),

  runDeliveryWorker: os.operations.runDeliveryWorker
    .use(requireDashboard())
    .handler(async ({ context, input }) => {
      const container = context.dashboardRequest.container;
      const worker = await container.createDeliveryWorker();
      const result = await worker.runOnce({
        limit: input?.limit ?? 10,
      });

      return {
        ...result,
        health: worker.getHealth(),
        runnerHealth: (await container.ensureDeliveryWorkerRunner()).getHealth(),
      };
    }),
});
