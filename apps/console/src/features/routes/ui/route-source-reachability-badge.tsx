import { RiErrorWarningLine } from "@remixicon/react";

import { Badge } from "#/components/ui/badge";
import type { RouteSourceReachability } from "#/features/routes/model/route-source-reachability";
import { useTranslations } from "#/i18n/use-i18n";

type UnreachableReachability = Exclude<RouteSourceReachability, { kind: "reachable" }>;

/**
 * Shows why an enabled route cannot receive events. Amber matches the warning
 * tone used for the rule's status-scope badge, so it reads as a warning about
 * the rule rather than as one more matcher chip.
 */
export function RouteSourceReachabilityBadge({
  reachability,
}: {
  reachability: UnreachableReachability;
}) {
  const t = useTranslations();
  const copy =
    reachability.kind === "all-disabled"
      ? {
          label: t("routing.table.sourceReachability.allDisabled"),
          hint: t("routing.table.sourceReachability.allDisabledHint", {
            count: reachability.sourceCount,
          }),
        }
      : {
          label: t("routing.table.sourceReachability.noSource"),
          hint: t("routing.table.sourceReachability.noSourceHint"),
        };

  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-600/30 bg-amber-50 text-amber-700"
      title={copy.hint}
    >
      <RiErrorWarningLine aria-hidden />
      {copy.label}
    </Badge>
  );
}
