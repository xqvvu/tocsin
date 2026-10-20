import type { RouteMatchCheck } from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Evidence badges for the checks that produced a route match.
 *
 * Shared by the event route-match table and the delivery route evidence panel:
 * both explain the same core-produced checks, so their wording and their
 * "expected vs actual" rendering must not drift apart.
 */
export function RouteMatchCheckBadges({ checks }: { checks: RouteMatchCheck[] }) {
  const t = useTranslations();

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {checks.map((check, index) => (
        <Badge
          key={`${index}-${check.field}-${check.detail}`}
          variant={check.matched ? "outline" : "destructive"}
          className="h-auto max-w-full justify-start py-1 whitespace-normal"
          title={check.detail}
        >
          <span className="shrink-0 font-medium">{t(`routeChecks.fields.${check.field}`)}</span>
          <span className="text-muted-foreground text-left break-words whitespace-normal">
            {describeRouteCheck(check, t)}
          </span>
        </Badge>
      ))}
    </div>
  );
}

/**
 * Render a check's evidence in the operator's language.
 *
 * `detail` is built in core as an English string, and for the label / title /
 * message conditions it only ever carried the rule's *expected* value — so
 * "why did this miss?" forced a trip to the normalized tab to find out what the
 * event actually said. Checks written before `condition` existed have no
 * structured form; those snapshots are immutable, so they fall back to the raw
 * detail rather than being rewritten.
 */
function describeRouteCheck(check: RouteMatchCheck, t: ReturnType<typeof useTranslations>): string {
  // `enabled` is the route's own state, not a rule condition, so "no condition"
  // would misdescribe a disabled route. State the fact instead.
  if (check.field === "enabled") {
    return check.matched ? t("routeChecks.enabled") : t("routeChecks.disabled");
  }

  const actual = check.actual;
  const enumerable =
    (check.field === "severity" || check.field === "status") && actual !== undefined;
  const expected =
    check.expected === undefined || check.expected.length === 0 ? undefined : check.expected;
  const localized = expected?.map((value) => {
    if (check.field === "severity") {
      return t(`common.severity.${value}`);
    }

    if (check.field === "status") {
      return t(`common.alertStatus.${value}`);
    }

    return value;
  });

  if (check.condition === "none") {
    return t("routeChecks.none");
  }

  if (check.condition === "compare" && localized) {
    const wanted = localized.join(", ");

    if (check.field === "label") {
      return actual === undefined
        ? t("routeChecks.labelMissing", { key: check.labelKey ?? "", value: wanted })
        : t("routeChecks.label", {
            key: check.labelKey ?? "",
            value: wanted,
            actual,
          });
    }

    if (!enumerable) {
      return actual === undefined
        ? t("routeChecks.expectedOnly", { value: wanted })
        : t("routeChecks.contains", { value: wanted, actual });
    }

    return t("routeChecks.received", {
      value: wanted,
      actual: localizeActualValue(check, actual, t),
    });
  }

  return check.detail;
}

/**
 * Translate the event's raw severity/status enum for the "actual" half of a
 * comparison. Other check fields carry operator data (labels, titles, message
 * fragments) that must stay verbatim. `actual` is always present when the
 * `enumerable` branch runs; the empty fallback only satisfies the type.
 */
function localizeActualValue(
  check: RouteMatchCheck,
  actual: string | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (actual === undefined) {
    return "";
  }

  if (check.field === "severity") {
    return t(`common.severity.${actual}`);
  }

  if (check.field === "status") {
    return t(`common.alertStatus.${actual}`);
  }

  return actual;
}
