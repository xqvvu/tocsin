import { mapValues } from "es-toolkit/object";

import type { EventRecord } from "#core/event/event";
import type { NormalizedEvent } from "#core/event/normalized-event";
import type { JsonObject, JsonValue } from "#core/json";
import type { RouteMatchResult } from "#core/route/route";

/**
 * Keys that are sensitive only when they appear verbatim. Keys are normalized
 * before comparison by lower-casing and stripping separators, so camelCase,
 * kebab-case, snake_case, and HTTP header casing all share one entry.
 */
const SENSITIVE_EXACT_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "token",
  "tokens",
  "tokenhash",
  "secret",
  "password",
  "passwd",
  "passphrase",
  "passwordhash",
  "passwordconfirmation",
  "credential",
  "credentials",
  "apikey",
  "accesskey",
  "secretkey",
  "privatekey",
  "signingkey",
  "signingsecret",
  "signsecret",
  "webhookurl",
]);

/**
 * Suffixes that mark a value as a credential regardless of its prefix, such as
 * `appSecret`, `client_secret`, or `x-auth-token`. The suffixes stay
 * noun-shaped on purpose: `tokenCount`, `maxTokens`, and `privateKeyId` are
 * operational fields, not credentials. `token$` rather than `tokens$` keeps
 * `maxTokens` visible; plural nouns are handled by the exact set above.
 */
const SENSITIVE_KEY_SUFFIX_PATTERN =
  /(?:secret|token|password|passwd|passphrase|credential|privatekey|apikey|authorization|cookie)$/;

/**
 * Text logs carry the original key spelling, not a normalized one. The
 * alternation is generated from the same set and suffix rule used by
 * `isSensitiveKey`, with optional separators between exact-key characters, so
 * `webhook_url`, `webhook-url`, and `webhookUrl` share one branch.
 */
const SENSITIVE_TEXT_KEY_SOURCE = [
  ...[...SENSITIVE_EXACT_KEYS].map((key) => key.split("").join("[._-]?")),
  "[A-Za-z0-9._-]*(?:secret|token|password|passwd|passphrase|credential|privatekey|apikey|authorization|cookie)",
].join("|");

// The `\b` keeps identifiers that merely end in a sensitive suffix, such as
// `max_tokens`, from matching from their tail (`tokens: 4096`).
const TEXT_ASSIGNMENT_PATTERN = new RegExp(
  `(["']?)\\b(${SENSITIVE_TEXT_KEY_SOURCE})\\1(\\s*[:=]\\s*)(?:"((?:\\\\.|[^"\\\\])*)"(?=\\s*[,;}\\]\\n\\r]|$)|'((?:\\\\.|[^'\\\\])*)'(?=\\s*[,;}\\]\\n\\r]|$)|([^,;\\n\\r]*?)(?=\\s+["']?(?:${SENSITIVE_TEXT_KEY_SOURCE})["']?\\s*[:=]|[,;\\n\\r]|$))`,
  "gi",
);

export const REDACTED_VALUE = "[REDACTED]";

/**
 * Credential shapes that can appear without a `key=value` prefix, such as a
 * bare `Authorization` header value copied into an error message, URL
 * userinfo, or a chat-provider webhook URL. The matchers stay deliberately
 * narrow: prose such as `Bearer token`, operational identifiers such as
 * `disk-space-low`, and ordinary URLs stay visible.
 */
const CREDENTIAL_VALUE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
}> = [
  // Chat webhook URLs carry their secret in the path. Capture scheme and host
  // so the same URL inside and outside an assignment converges to one shape.
  {
    pattern: /(https?:\/\/hooks\.slack\.com\/services\/)[A-Za-z0-9/_-]+/gi,
    replacement: "$1[REDACTED]",
  },
  {
    pattern:
      /(https?:\/\/open\.(?:feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\/)[A-Za-z0-9-]+/gi,
    replacement: "$1[REDACTED]",
  },
  // Slack app tokens have a fixed prefix. Requiring a plausible body keeps the
  // bare prefix intact when it appears as prose.
  {
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g,
    replacement: REDACTED_VALUE,
  },
  // URL userinfo password. Keep user and host so operators can still tell
  // which endpoint failed; only the password is replaced.
  {
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
    replacement: "$1$2:[REDACTED]@",
  },
  // Authentication schemes in free text. The value must be at least eight
  // characters and contain a digit or symbol, so prose such as
  // `Basic authentication` and `Bearer token` stays readable. Generic `Bot`
  // is omitted on purpose so ordinary English is untouched.
  {
    pattern:
      /\b(Bearer|Basic|Token)\s+((?=[A-Za-z0-9._~+/=-]{8,}(?![A-Za-z0-9._~+/=-]))(?=[A-Za-z0-9._~+/=-]*[0-9._~+/=-])[A-Za-z0-9._~+/=-]+)/gi,
    replacement: "$1 [REDACTED]",
  },
];

/**
 * Redacts high-confidence credential values regardless of the surrounding
 * key. Safe to apply more than once: every replacement also fails its own
 * matcher on the next pass.
 */
export function redactCredentialText(value: string): string {
  return CREDENTIAL_VALUE_PATTERNS.reduce(
    (text, { pattern, replacement }) => text.replace(pattern, replacement),
    value,
  );
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);

  return SENSITIVE_EXACT_KEYS.has(normalized) || SENSITIVE_KEY_SUFFIX_PATTERN.test(normalized);
}

/**
 * Redacts header values for display or transport.
 *
 * A sensitive name replaces the whole value. Every other value still runs
 * through text redaction, because a credential can sit in a header the
 * denylist does not name (`X-Auth: Bearer ...`) and a header value is machine
 * data where over-redaction costs little.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return mapValues(headers, (value, key) =>
    isSensitiveKey(String(key)) ? REDACTED_VALUE : redactText(value),
  );
}

export function redactJsonValue(value: JsonValue): JsonValue {
  return redactJson(value, redactCredentialText);
}

/**
 * Projects a JSON value with assignment-shape redaction in string leaves.
 *
 * `redactJsonValue` only applies value-shape rules to strings, because keys
 * already name the sensitive fields in structured data and write-side
 * redaction is permanent. Read and send boundaries need the wider net: a
 * rendered payload or raw provider value can carry `{"text": "token=..."}`
 * under a neutral key, which the value-shape rules alone do not catch.
 */
export function redactJsonText(value: JsonValue): JsonValue {
  return redactJson(value, redactText);
}

function redactJson(value: JsonValue, redactString: (input: string) => string): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => redactJson(entry, redactString));
  }

  if (typeof value === "object" && value !== null) {
    return mapValues(value as JsonObject, (entry, key) =>
      isSensitiveKey(String(key)) ? REDACTED_VALUE : redactJson(entry, redactString),
    ) as JsonObject;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  return value;
}

export function redactText(value: string): string {
  return redactCredentialText(redactSensitiveAssignments(value));
}

/**
 * Projects a normalized event for a read or send boundary.
 *
 * Stored `title`, `message`, and `labels` are provider-authored and have never
 * been redacted at intake, because route matching, suppression, dedupe, and
 * replay must keep comparing the original values. Callers that turn an event
 * into a dashboard DTO or an outbound notification use this projection so a
 * credential pasted into an alert body does not reach the screen or the
 * destination. `fingerprint` stays untouched: it is the dedupe and suppression
 * key, not display copy.
 */
export function redactNormalizedEvent(event: NormalizedEvent): NormalizedEvent {
  return {
    ...event,
    title: redactText(event.title),
    message: redactText(event.message),
    labels: mapValues(event.labels, (value, key) =>
      isSensitiveKey(String(key)) ? REDACTED_VALUE : redactText(value),
    ),
  };
}

/**
 * Project route-match evidence for display.
 *
 * `expected` is rule configuration and stays readable; `actual` carries the
 * event value the rule compared, so it can repeat the same credential the
 * event title or label already contained. Matching itself keeps using the raw
 * result — this projection is only for DTOs.
 */
export function redactRouteMatchResults(results: RouteMatchResult[]): RouteMatchResult[] {
  return results.map((result) => ({
    ...result,
    checks: result.checks.map((check) => {
      if (check.actual === undefined) {
        return check;
      }

      // A label check names the key it compared. When that key is
      // credential-shaped, hide the value entirely — the same rule the
      // normalized event applies to its labels.
      const actual =
        check.labelKey !== undefined && isSensitiveKey(check.labelKey)
          ? REDACTED_VALUE
          : redactText(check.actual);

      return { ...check, actual };
    }),
  }));
}

/**
 * Projects a stored event for a read boundary.
 *
 * Raw payloads and headers are already redacted on intake; re-projecting them
 * is idempotent and covers rows written before value-shape redaction existed.
 * Provider metadata is stored verbatim (parsers need it) and only projected
 * here, the same approach as the normalized fields.
 */
export function redactEventRecord(event: EventRecord): EventRecord {
  return {
    ...event,
    normalized: redactNormalizedEvent(event.normalized),
    // The idempotency key is provider-supplied and rendered on the detail page.
    // It is not used for matching at read time, so the DTO can redact it.
    idempotencyKey: event.idempotencyKey === null ? null : redactText(event.idempotencyKey),
    providerMetadata: redactJsonText(event.providerMetadata) as JsonObject,
    rawPayload: redactJsonText(event.rawPayload),
    rawHeaders: redactHeaders(event.rawHeaders),
    routeMatches: event.routeMatches === null ? null : redactRouteMatchResults(event.routeMatches),
  };
}

function redactSensitiveAssignments(value: string): string {
  return value.replace(
    TEXT_ASSIGNMENT_PATTERN,
    (
      match,
      quote: string,
      key: string,
      separator: string,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      unquotedValue: string | undefined,
    ) => {
      if (!isSensitiveKey(key)) {
        return match;
      }

      const quoteChar =
        doubleQuotedValue !== undefined
          ? '"'
          : singleQuotedValue !== undefined
            ? "'"
            : quotedFallback(unquotedValue);
      const redactedValue = quoteChar
        ? `${quoteChar}${REDACTED_VALUE}${quoteChar}`
        : REDACTED_VALUE;

      return `${quote}${key}${quote}${separator}${redactedValue}`;
    },
  );
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A quoted value can fall through to the unquoted branch when it is followed
 * by another assignment instead of a JSON delimiter. Keep its quotes so the
 * replacement still reads as a value rather than a stray token.
 */
function quotedFallback(value: string | undefined): string {
  const trimmed = (value ?? "").trimEnd();
  const quote = trimmed[0];

  return (quote === '"' || quote === "'") && trimmed.length > 1 && trimmed.endsWith(quote)
    ? quote
    : "";
}
