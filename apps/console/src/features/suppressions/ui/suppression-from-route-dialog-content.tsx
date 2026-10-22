import type { RouteDefinition } from "@tocsin/core";

import { suppressionDefaultsFromRoute } from "#/features/suppressions/model/suppression-form";
import { SuppressionFromRowDialogContent } from "#/features/suppressions/ui/suppression-from-row-dialog-content";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The route row's silence dialog, prefilled with the route's rule and targets.
 *
 * Deleting or disabling the route would stop the matching, but it would also
 * stop everything else the route does. A temporary silence keeps the matching
 * evidence intact while muting only what this route would have delivered.
 */
export function SuppressionFromRouteDialogContent({
  route,
  pending,
  onPendingChange,
  onSaved,
}: {
  route: RouteDefinition;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations();

  return (
    <SuppressionFromRowDialogContent
      copy={{
        title: t("suppressions.fromRoute.title"),
        description: t("suppressions.fromRoute.description"),
        context: t("suppressions.fromRoute.context", {
          routeName: route.name,
          destinationCount: route.destinationIds.length,
        }),
        loadFailed: t("suppressions.fromRoute.loadFailed"),
        loading: t("suppressions.fromRoute.loading"),
        toastSuccess: t("suppressions.fromRoute.toast.success"),
        toastFailed: t("suppressions.fromRoute.toast.failed"),
      }}
      buildDefaults={(timeZone) =>
        suppressionDefaultsFromRoute({
          name: t("suppressions.fromRoute.nameTemplate", { name: route.name }),
          route,
          timeZone,
        })
      }
      pending={pending}
      onPendingChange={onPendingChange}
      onSaved={onSaved}
    />
  );
}
