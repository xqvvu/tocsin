import { RiDatabase2Line } from "@remixicon/react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Explains why the raw tab has nothing to show.
 *
 * The retention sweep replaces `rawPayload` and `rawHeaders` with internal
 * placeholders. Rendering those as JSON would make an operator read a cleared
 * record as if the upstream had sent it, so the pruned case gets its own state.
 */
export function EventRawPrunedNotice() {
  const t = useTranslations();

  return (
    <Alert>
      <RiDatabase2Line aria-hidden />
      <AlertTitle>{t("events.detail.rawPruned.title")}</AlertTitle>
      <AlertDescription>{t("events.detail.rawPruned.description")}</AlertDescription>
    </Alert>
  );
}
