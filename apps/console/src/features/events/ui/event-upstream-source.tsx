import { RiExternalLinkLine } from "@remixicon/react";
import { Fragment } from "react";

import type { JsonObject } from "@tocsin/core";

import { buildEventUpstreamSource } from "#/features/events/model/event-upstream-source";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Where the event came from: links back to the upstream alert and the intake
 * metadata the provider parser recorded.
 *
 * The links are the fast path an on-call engineer takes when a Tocsin event is
 * not enough context ("which Grafana rule fired, and what did it look like
 * there?"). Everything here is read-only provider data; the component renders
 * nothing when the parser recorded no metadata.
 */
export function EventUpstreamSource({ providerMetadata }: { providerMetadata: JsonObject }) {
  const t = useTranslations();
  const upstream = buildEventUpstreamSource(providerMetadata);

  if (!upstream) {
    return null;
  }

  return (
    <div className="border-border border-t p-3">
      <div className="text-muted-foreground mb-2 text-[11px]">
        {t("events.detail.upstream.title")}
      </div>
      {upstream.links.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {upstream.links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              title={link.href}
              className="border-border bg-background hover:bg-accent inline-flex max-w-full items-center gap-1 border px-1.5 py-1 text-[11px] font-medium"
            >
              <RiExternalLinkLine className="size-3 shrink-0" aria-hidden />
              <span className="shrink-0">{t(link.labelKey)}</span>
              <span className="text-muted-foreground truncate">{link.host}</span>
            </a>
          ))}
        </div>
      ) : null}
      {upstream.metadata.length > 0 ? (
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          {upstream.metadata.map((entry) => (
            <Fragment key={entry.key}>
              <dt className="text-muted-foreground">
                {entry.labelKey ? t(entry.labelKey) : entry.key}
              </dt>
              <dd className="min-w-0 font-medium break-all">{entry.value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
