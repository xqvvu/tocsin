import type { JsonObject, JsonValue } from "@tocsin/core";

/**
 * Provider metadata keys that point back at the upstream alert.
 *
 * Alertmanager-compatible payloads carry `externalURL` (the Alertmanager
 * itself), `generatorURL` (the rule that fired), and optionally `silenceURL`;
 * Grafana payloads additionally carry `dashboardURL` and `panelURL`. They are
 * rendered as links instead of plain metadata so an operator can jump from the
 * event back to the dashboard, panel, or silence form that produced it.
 */
const LINK_KEYS = [
  "externalURL",
  "generatorURL",
  "dashboardURL",
  "panelURL",
  "silenceURL",
] as const;

type UpstreamLinkKey = (typeof LINK_KEYS)[number];

/** Metadata keys with a product label; everything else falls back to the key. */
const METADATA_LABELS = {
  provider: "events.detail.upstream.meta.provider",
  parserVersion: "events.detail.upstream.meta.parserVersion",
  alertCount: "events.detail.upstream.meta.alertCount",
  receiver: "events.detail.upstream.meta.receiver",
  groupKey: "events.detail.upstream.meta.groupKey",
  payloadHash: "events.detail.upstream.meta.payloadHash",
  externalURL: "events.detail.upstream.links.externalURL",
  generatorURL: "events.detail.upstream.links.generatorURL",
  dashboardURL: "events.detail.upstream.links.dashboardURL",
  panelURL: "events.detail.upstream.links.panelURL",
  silenceURL: "events.detail.upstream.links.silenceURL",
} as const satisfies Record<string, string>;

const METADATA_ORDER = [
  "provider",
  "parserVersion",
  "alertCount",
  "receiver",
  "groupKey",
  "payloadHash",
] as const;

const METADATA_ORDER_INDEX = new Map<string, number>(
  METADATA_ORDER.map((key, index) => [key, index]),
);

export interface EventUpstreamLink {
  key: UpstreamLinkKey;
  href: string;
  /** Host plus optional port, shown next to the label. */
  host: string;
  labelKey: string;
}

export interface EventUpstreamMetadataEntry {
  key: string;
  value: string;
  /** Translation key for known fields; `null` means render the raw key. */
  labelKey: string | null;
}

export interface EventUpstreamSource {
  links: EventUpstreamLink[];
  metadata: EventUpstreamMetadataEntry[];
}

/**
 * Projects the stored provider metadata into what the event page can show.
 *
 * Only `http:`/`https:` URLs become links — the metadata is provider-authored
 * data, so an allowlist is the boundary that keeps a `javascript:` URL from
 * becoming an executable anchor. Credentials in the URL are dropped before the
 * value reaches the DOM. Non-scalar metadata is skipped: the Raw tab already
 * shows the complete payload.
 */
export function buildEventUpstreamSource(providerMetadata: JsonObject): EventUpstreamSource | null {
  const links: EventUpstreamLink[] = [];
  const consumedKeys = new Set<string>();

  for (const key of LINK_KEYS) {
    const link = toUpstreamLink(key, providerMetadata[key]);
    if (link) {
      links.push(link);
      consumedKeys.add(key);
    }
  }

  const metadata = Object.entries(providerMetadata)
    .filter(([key]) => !consumedKeys.has(key))
    .flatMap(([key, value]) => {
      const scalar = toScalarString(value);
      return scalar === null ? [] : [{ key, value: scalar }];
    })
    .sort(compareMetadataEntries)
    .map((entry) => ({
      ...entry,
      labelKey: labelKeyFor(entry.key),
    }));

  if (links.length === 0 && metadata.length === 0) {
    return null;
  }

  return { links, metadata };
}

function toUpstreamLink(
  key: UpstreamLinkKey,
  value: JsonValue | undefined,
): EventUpstreamLink | null {
  if (typeof value !== "string") {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  // Provider URLs are not a trusted place for credentials, and a URL like
  // `https://user:pass@host` would leak them into the DOM, the address bar and
  // the browser history on click.
  if (url.username !== "" || url.password !== "") {
    url.username = "";
    url.password = "";
  }

  return {
    key,
    href: url.toString(),
    host: url.host,
    labelKey: `events.detail.upstream.links.${key}`,
  };
}

function toScalarString(value: JsonValue): string | null {
  if (typeof value === "string") {
    return value === "" ? null : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function labelKeyFor(key: string): string | null {
  return key in METADATA_LABELS ? METADATA_LABELS[key as keyof typeof METADATA_LABELS] : null;
}

function compareMetadataEntries(left: { key: string }, right: { key: string }): number {
  const leftIndex = METADATA_ORDER_INDEX.get(left.key);
  const rightIndex = METADATA_ORDER_INDEX.get(right.key);

  if (leftIndex !== undefined && rightIndex !== undefined) {
    return leftIndex - rightIndex;
  }

  if (leftIndex !== undefined) {
    return -1;
  }

  if (rightIndex !== undefined) {
    return 1;
  }

  return left.key.localeCompare(right.key);
}
