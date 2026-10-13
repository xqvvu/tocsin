import { oc } from "@orpc/contract";

import { RequestLocaleOutputSchema } from "../schemas/i18n";

/**
 * Public locale probe.
 *
 * The root route resolves the interface locale before any dashboard session
 * exists, so this procedure stays public. It reads app settings and request
 * headers only; it never touches user-owned data.
 */
export const i18n = {
  getRequestLocale: oc.output(RequestLocaleOutputSchema),
};
