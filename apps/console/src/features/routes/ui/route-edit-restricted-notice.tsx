import { RiInformationLine } from "@remixicon/react";

import type { RouteDefinition } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
  getRouteRuleFormRestrictions,
  type RouteRuleFormRestrictionField,
} from "#/features/routes/model/route-form";
import { useTranslations } from "#/i18n/use-i18n";

export function RouteEditRestrictedNotice({ rule }: { rule: RouteDefinition["rule"] }) {
  const t = useTranslations();
  const restrictions = getRouteRuleFormRestrictions(rule);

  if (!restrictions.restricted) {
    return null;
  }

  return (
    <Alert className="mb-3" data-testid="route-edit-restricted-notice">
      <RiInformationLine aria-hidden />
      <AlertTitle>{t("routing.form.edit.restrictedTitle")}</AlertTitle>
      <AlertDescription>
        <p>{t("routing.form.edit.restrictedDescription")}</p>
        <ul className="mt-1 list-disc pl-4">
          {restrictions.fields.map((field) => (
            <li key={field.field}>
              {t("routing.form.edit.restrictedFieldSummary", {
                field: t(routeRestrictionFieldLabelKey(field.field)),
                total: field.total,
                preserved: field.preserved,
              })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function routeRestrictionFieldLabelKey(
  field: RouteRuleFormRestrictionField,
):
  | "routing.form.edit.restrictedField.sources"
  | "routing.form.edit.restrictedField.severities"
  | "routing.form.edit.restrictedField.statuses"
  | "routing.form.edit.restrictedField.labels"
  | "routing.form.edit.restrictedField.titleContains"
  | "routing.form.edit.restrictedField.messageContains" {
  switch (field) {
    case "sourceIds":
      return "routing.form.edit.restrictedField.sources";
    case "severities":
      return "routing.form.edit.restrictedField.severities";
    case "statuses":
      return "routing.form.edit.restrictedField.statuses";
    case "labels":
      return "routing.form.edit.restrictedField.labels";
    case "titleContains":
      return "routing.form.edit.restrictedField.titleContains";
    case "messageContains":
      return "routing.form.edit.restrictedField.messageContains";
  }
}
