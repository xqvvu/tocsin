import { withDashboardService } from "#/server/orpc/middlewares/require-dashboard";
import { os } from "#/server/orpc/os";

/** Console runtime settings. */
const withAppSettingsService = withDashboardService((container) =>
  container.createAppSettingsService(),
);
const withRuntimeInformationService = withDashboardService((container) =>
  container.createRuntimeInformationService(),
);

export const settingsRouter = os.settings.router({
  get: os.settings.get
    .use(withAppSettingsService)
    .handler(({ context }) => context.service.getAppSettings()),

  getRuntime: os.settings.getRuntime
    .use(withRuntimeInformationService)
    .handler(({ context }) => context.service.getRuntimeInformation()),

  update: os.settings.update
    .use(withAppSettingsService)
    .handler(({ context, input }) => context.service.updateAppSettings(input)),
});
