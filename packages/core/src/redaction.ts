import { mapValues } from "es-toolkit/object";

import type { JsonObject, JsonValue } from "#core/json";

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

const TEXT_ASSIGNMENT_PATTERN = new RegExp(
  `(["']?)(${SENSITIVE_TEXT_KEY_SOURCE})\\1(\\s*[:=]\\s*)(?:"((?:\\\\.|[^"\\\\])*)"(?=\\s*[,;}\\]\\n\\r]|$)|'((?:\\\\.|[^'\\\\])*)'(?=\\s*[,;}\\]\\n\\r]|$)|([^,;\\n\\r]*?)(?=\\s+["']?(?:${SENSITIVE_TEXT_KEY_SOURCE})["']?\\s*[:=]|[,;\\n\\r]|$))`,
  "gi",
);

export const REDACTED_VALUE = "[REDACTED]";

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);

  return SENSITIVE_EXACT_KEYS.has(normalized) || SENSITIVE_KEY_SUFFIX_PATTERN.test(normalized);
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return mapValues(headers, (value, key) => (isSensitiveKey(String(key)) ? REDACTED_VALUE : value));
}

export function redactJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }

  if (typeof value === "object" && value !== null) {
    return mapValues(value as JsonObject, (entry, key) =>
      isSensitiveKey(String(key)) ? REDACTED_VALUE : redactJsonValue(entry),
    ) as JsonObject;
  }

  return value;
}

export function redactText(value: string): string {
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
