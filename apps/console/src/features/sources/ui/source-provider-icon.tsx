import alertmanagerIconUrl from "@tocsin/providers/assets/provider-icons/alertmanager.svg";
import fastgptIconUrl from "@tocsin/providers/assets/provider-icons/fastgpt.svg";
import grafanaIconUrl from "@tocsin/providers/assets/provider-icons/grafana.svg";
import signozIconUrl from "@tocsin/providers/assets/provider-icons/signoz.svg";
import uptimeKumaIconUrl from "@tocsin/providers/assets/provider-icons/uptime-kuma.svg";
import webhookIconUrl from "@tocsin/providers/assets/provider-icons/webhook.svg";

import type { SourceSummary } from "#/features/sources/ui/source-ui-types";

export function SourceProviderIcon({ provider }: { provider: SourceSummary["provider"] }) {
  return (
    <img
      className="size-5 object-contain"
      src={sourceProviderIconUrl(provider)}
      alt=""
      aria-hidden
    />
  );
}

function sourceProviderIconUrl(provider: SourceSummary["provider"]): string {
  switch (provider) {
    case "alertmanager":
      return alertmanagerIconUrl;
    case "fastgpt":
      return fastgptIconUrl;
    case "grafana":
      return grafanaIconUrl;
    case "signoz":
      return signozIconUrl;
    case "uptime_kuma":
      return uptimeKumaIconUrl;
    case "generic":
      return webhookIconUrl;
    default: {
      const exhaustive: never = provider;
      return exhaustive;
    }
  }
}
