import type { ProviderReference } from "@tocsin/core";

import { CopyableCodeLine } from "#/components/common/copyable-code-line";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Receipt for one delivery row in the deliveries list.
 *
 * The event detail table already answers "did this target return a message
 * reference"; the list needs the same handle so an operator can find the job
 * without opening every delivery. Response status and time stay on the detail
 * page because the list projection does not join attempts.
 */
export function DeliveryReceiptCell({
  providerReference,
}: {
  providerReference: ProviderReference | null;
}) {
  const t = useTranslations();

  if (providerReference === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <CopyableCodeLine
      value={providerReference.value}
      copyValue={providerReference.value}
      copyLabel={t("deliveries.table.receipt.copy")}
      tooltipValue={`${providerReference.type}: ${providerReference.value}`}
    />
  );
}
