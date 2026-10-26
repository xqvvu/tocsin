import { isJsonObject } from "#core/json";

/**
 * What intake records when a provider parser rejects a webhook payload.
 *
 * A rejected payload still becomes an event: the operator needs the audit row
 * and the preserved raw payload to fix the upstream or the parser. The intake
 * service writes these keys into `providerMetadata`; the console reads them
 * back to mark the event as a parse failure instead of presenting it as a
 * provider-authored alert with `unknown` severity.
 *
 * Only the presence of `parseFailed: true` is load-bearing. The remaining
 * fields are best-effort diagnostics, so one malformed field must not demote a
 * real parse failure back to "normal".
 */
export interface ParseFailureMetadata {
  /** Why the parser rejected the payload, as recorded by intake. */
  reason?: string;
  /** Error class intake caught; `ProviderParseFailure` for parser rejections. */
  errorName?: string;
  /** Redacted human-readable error message. */
  errorMessage?: string;
  /** Stable hash of the rejected payload, for correlating repeats. */
  payloadHash?: string;
}

/**
 * Projects provider metadata into the parse-failure facts the UI can show.
 *
 * Tolerant of arbitrary JSON: `providerMetadata` is stored provider-adjacent
 * data that reaches this through a JSON column, and the console must render a
 * damaged row as "no failure metadata" rather than throw the page away.
 */
export function parseFailureMetadataFrom(metadata: unknown): ParseFailureMetadata | null {
  if (!isJsonObject(metadata) || metadata.parseFailed !== true) {
    return null;
  }

  return {
    ...optionalString(metadata, "reason"),
    ...optionalString(metadata, "errorName"),
    ...optionalString(metadata, "errorMessage"),
    ...optionalString(metadata, "payloadHash"),
  };
}

function optionalString(
  metadata: Record<string, unknown>,
  key: keyof ParseFailureMetadata,
): Partial<ParseFailureMetadata> {
  const value = metadata[key];

  return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
}
