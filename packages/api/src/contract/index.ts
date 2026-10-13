import { destinations } from "./destinations";
import { health } from "./health";
import { i18n } from "./i18n";
import { integrations } from "./integrations";
import { operations } from "./operations";
import { portability } from "./portability";
import { routes } from "./routes";
import { session } from "./session";
import { settings } from "./settings";
import { sources } from "./sources";
import { suppressions } from "./suppressions";

export { session } from "./session";
export { destinations } from "./destinations";
export { health } from "./health";
export { i18n } from "./i18n";
export { integrations } from "./integrations";
export { operations } from "./operations";
export { portability } from "./portability";
export { routes } from "./routes";
export { settings } from "./settings";
export { sources } from "./sources";
export { suppressions } from "./suppressions";

/**
 * Root contract: one namespace per business capability.
 *
 * Implementers in `apps/console` mirror this shape exactly through
 * `os.router(...)`, so the router and the contract cannot drift apart.
 */
export const contract = {
  session,
  destinations,
  health,
  i18n,
  integrations,
  operations,
  portability,
  routes,
  settings,
  sources,
  suppressions,
};
