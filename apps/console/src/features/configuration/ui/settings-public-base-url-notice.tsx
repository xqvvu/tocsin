import { RiErrorWarningLine } from "@remixicon/react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { classifyPublicBaseUrl } from "#/features/configuration/model/public-base-url";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Explains why notification deep links will not open for recipients.
 *
 * Only the two broken states render: a missing base URL leaves
 * `tocsin.eventUrl` empty, and the Compose default `http://localhost:3000`
 * produces a link only the console host can open. A public origin needs no
 * commentary beyond the fact row.
 */
export function SettingsPublicBaseUrlNotice({ publicBaseUrl }: { publicBaseUrl: string | null }) {
  const t = useTranslations();
  const state = classifyPublicBaseUrl(publicBaseUrl);

  if (state === "public") {
    return null;
  }

  if (state === "missing") {
    return (
      <BaseUrlAlert
        title={t("configuration.runtime.publicBaseUrlMissingTitle")}
        description={t("configuration.runtime.publicBaseUrlMissingDescription")}
      />
    );
  }

  return (
    <BaseUrlAlert
      title={t("configuration.runtime.publicBaseUrlLocalTitle")}
      description={t("configuration.runtime.publicBaseUrlLocalDescription", {
        url: publicBaseUrl ?? "",
      })}
    />
  );
}

function BaseUrlAlert({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-3 py-2.5">
      <Alert>
        <RiErrorWarningLine aria-hidden />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    </div>
  );
}
