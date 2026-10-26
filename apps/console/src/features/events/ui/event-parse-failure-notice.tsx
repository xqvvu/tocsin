import { RiErrorWarningLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { type JsonObject, parseFailureMetadataFrom } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The free-text term that finds every parser-rejected event.
 *
 * Intake stores it in the fingerprint (`parse_failed:<source>:<hash>`) and in
 * the `parse_failed` label, and the event search covers both, so the existing
 * list filter is enough — no dedicated URL dimension is needed for this slice.
 */
const PARSE_FAILURE_SEARCH_QUERY = "parse_failed";

/**
 * Parser failure reasons intake records. Unknown values fall back to the raw
 * machine value instead of hiding information the operator needs.
 */
const REASON_LABEL_KEYS: Record<string, string> = {
  invalid_payload: "events.detail.parseFailure.reason.invalidPayload",
  unsupported_payload: "events.detail.parseFailure.reason.unsupportedPayload",
  configuration_error: "events.detail.parseFailure.reason.configurationError",
  unknown_error: "events.detail.parseFailure.reason.unknownError",
};

/**
 * Why this event exists at all: the provider parser rejected its payload.
 *
 * The generic event title and `unknown` severity make a parse failure look
 * like an alert the upstream sent, and the diagnostics live in provider
 * metadata that the normalized tab shows with raw English keys. Promoting them
 * here turns "an odd unknown event" into an actionable "fix the parser or the
 * upstream, then replay the event".
 */
export function EventParseFailureNotice({ providerMetadata }: { providerMetadata?: JsonObject }) {
  const t = useTranslations();
  const failure = parseFailureMetadataFrom(providerMetadata);

  if (!failure) {
    return null;
  }

  const details = [
    failure.reason
      ? {
          key: "reason",
          label: t("events.detail.parseFailure.fields.reason"),
          value: reasonLabel(failure.reason, t),
        }
      : null,
    failure.errorName
      ? {
          key: "errorName",
          label: t("events.detail.parseFailure.fields.errorName"),
          value: failure.errorName,
        }
      : null,
    failure.errorMessage
      ? {
          key: "errorMessage",
          label: t("events.detail.parseFailure.fields.errorMessage"),
          value: failure.errorMessage,
        }
      : null,
    failure.payloadHash
      ? {
          key: "payloadHash",
          label: t("events.detail.parseFailure.fields.payloadHash"),
          value: failure.payloadHash,
        }
      : null,
  ].filter((detail) => detail !== null);

  return (
    <Alert variant="destructive">
      <RiErrorWarningLine aria-hidden />
      <AlertTitle>{t("events.detail.parseFailure.title")}</AlertTitle>
      <AlertDescription>
        <p>{t("events.detail.parseFailure.description")}</p>
        {details.length > 0 ? (
          <dl className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1">
            {details.map((detail) => (
              <div key={detail.key} className="contents">
                <dt>{detail.label}</dt>
                <dd className="font-medium break-all">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <Link
          to="/events"
          search={{ q: PARSE_FAILURE_SEARCH_QUERY }}
          className="mt-2 inline-flex font-medium underline underline-offset-4"
        >
          {t("events.detail.parseFailure.viewSimilar")}
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function reasonLabel(reason: string, t: ReturnType<typeof useTranslations>): string {
  const labelKey = REASON_LABEL_KEYS[reason];

  return labelKey ? t(labelKey) : reason;
}
