import { withDashboardService } from "#/server/orpc/middlewares/require-dashboard";
import { os } from "#/server/orpc/os";

/** Console runtime settings. */
const withAppSettingsService = withDashboardService((container) =>
  container.createAppSettingsService(),
);
const withRuntimeInformationService = withDashboardService((container) =>
  container.createRuntimeInformationService(),
);
const withStorageHealthService = withDashboardService((container) =>
  container.createStorageHealthService(),
);

export const settingsRouter = os.settings.router({
  get: os.settings.get
    .use(withAppSettingsService)
    .handler(({ context }) => context.service.getAppSettings()),

  getRuntime: os.settings.getRuntime
    .use(withRuntimeInformationService)
    .handler(({ context }) => context.service.getRuntimeInformation()),

  getStorageHealth: os.settings.getStorageHealth
    .use(withStorageHealthService)
    .handler(({ context }) => context.service.getStorageHealth()),

  update: os.settings.update.use(withAppSettingsService).handler(({ context, input }) =>
    // Pause/resume evidence is written server-side from the verified session;
    // the browser never supplies the operator identity.
    context.service.updateAppSettings(input, {
      actor: context.dashboardRequest.currentUser.email,
    }),
  ),
});
