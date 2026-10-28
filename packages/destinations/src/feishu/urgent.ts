import type { AlertSeverity, AlertStatus, JsonObject } from "@tocsin/core";

import { FeishuConfigSchema } from "#destinations/feishu/schema";

/**
 * Receivers an automatic urgent call would ring for one delivery.
 *
 * This is the single definition of the automatic paging gate: the delivery
 * trigger in `OncallService` and the replay preview both call it, so an
 * operator preview can never promise a call the worker would not place (or
 * hide one it would). The gates are silent by design — a destination that is
 * not Feishu, not app mode, not auto-enabled, not firing, or outside the
 * severity list simply pages nobody.
 *
 * Delivery success and the provider message reference are decided at send
 * time and are not part of this predicate; callers that preview an unsent
 * delivery must present the result as an upper bound.
 */
export function feishuUrgentPagingReceivers(input: {
  config: JsonObject;
  status: AlertStatus;
  severity: AlertSeverity;
}): string[] {
  if (input.status !== "firing") {
    return [];
  }

  const parsed = FeishuConfigSchema.safeParse(input.config);

  if (!parsed.success) {
    return [];
  }

  const { sendMode, urgent } = parsed.data;

  if (sendMode !== "app" || !urgent?.autoEnabled) {
    return [];
  }

  // The schema normalises an empty list to the critical gate, so membership
  // is the whole rule. Keep it unconditional: a `length > 0` escape hatch
  // here is what let an empty imported list page every severity at once.
  if (!urgent.severities.some((severity) => severity === input.severity)) {
    return [];
  }

  return urgent.receivers;
}
