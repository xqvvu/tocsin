import { RiArrowRightLine } from "@remixicon/react";

import type {
  EventFingerprintChangeField,
  EventFingerprintFieldChange,
  EventFingerprintLabelChange,
} from "@tocsin/core";

import { Badge } from "#/components/ui/badge";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * What differs between this event and its previous occurrence.
 *
 * The previous value is muted and the current one is emphasized: the operator
 * already knows the alert is firing now, so the question this list answers is
 * "what is different this time". Severity and status are enum values and are
 * translated at this boundary; title and message keep the redacted text the
 * server sent. Labels are listed separately so an added label is never
 * mistaken for an emptied one.
 */
export function EventFingerprintChanges({
  fieldChanges,
  labelChanges,
}: {
  fieldChanges: EventFingerprintFieldChange[];
  labelChanges: EventFingerprintLabelChange[];
}) {
  const t = useTranslations();

  if (fieldChanges.length === 0 && labelChanges.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">{t("events.detail.fingerprint.noChanges")}</p>
    );
  }

  return (
    <section className="border-border bg-background flex flex-col gap-2 border p-3">
      <h3 className="text-xs font-semibold">{t("events.detail.fingerprint.changesTitle")}</h3>
      <ul className="flex flex-col gap-1.5 text-xs">
        {fieldChanges.map((change) => (
          <li key={change.field} className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge variant="outline">{t(`events.detail.fingerprint.fields.${change.field}`)}</Badge>
            <span className="text-muted-foreground min-w-0 wrap-break-word">
              {fieldValue(change.field, change.previous, t)}
            </span>
            <RiArrowRightLine className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 font-medium wrap-break-word">
              {fieldValue(change.field, change.current, t)}
            </span>
          </li>
        ))}
        {labelChanges.map((change) => {
          const before = change.previous;
          const after = change.current;

          return (
            <li key={`label:${change.key}`} className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {t("events.detail.fingerprint.labelKey", { key: change.key })}
              </Badge>
              {before === null ? (
                after === null ? null : (
                  <span className="min-w-0 font-medium wrap-break-word">
                    {t("events.detail.fingerprint.labelAdded", { value: after })}
                  </span>
                )
              ) : after === null ? (
                <span className="text-muted-foreground min-w-0 wrap-break-word">
                  {t("events.detail.fingerprint.labelRemoved", { value: before })}
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground min-w-0 wrap-break-word">{before}</span>
                  <RiArrowRightLine
                    className="text-muted-foreground size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0 font-medium wrap-break-word">{after}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function fieldValue(
  field: EventFingerprintChangeField,
  value: string,
  t: (key: string) => string,
): string {
  if (field === "severity") {
    return t(`common.severity.${value}`);
  }

  if (field === "status") {
    return t(`common.alertStatus.${value}`);
  }

  return value;
}
