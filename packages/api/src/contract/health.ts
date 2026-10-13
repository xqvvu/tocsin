import { oc } from "@orpc/contract";

import { HealthCheckOutput } from "../schemas/health";

export const health = {
  check: oc.output(HealthCheckOutput),
};
