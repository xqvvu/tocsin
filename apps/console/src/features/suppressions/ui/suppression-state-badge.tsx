import type { SuppressionState } from "@tocsin/core";

import { StatusBadge } from "#/components/common/status-badge";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The lifecycle state of a rule, derived from `suppressionStateAt`.
 *
 * `active` is the only state that silences anything, so it is the only one
 * carrying the "danger" tone; a disabled or expired rule must not look alarming.
 */
export function SuppressionStateBadge({ state }: { state: SuppressionState }) {
  const t = useTranslations();
  const tone = state === "active" ? "danger" : state === "scheduled" ? "warning" : "neutral";

  return (
    <StatusBadge tone={tone} pulse={state === "active"}>
      {t(`suppressions.state.${state}`)}
    </StatusBadge>
  );
}
