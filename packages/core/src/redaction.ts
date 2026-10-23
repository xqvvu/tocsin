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
  // A PEM-encoded key names its encoding, so the noun no longer ends the key
  // and the suffix rule misses it.
  "privatekeypem",
  "signingkey",
  "signingsecret",
  "signsecret",
  "webhookurl",
  // Credential names that end in a noun the suffix rule does not cover, or
  // whose suffix is ambiguous. Kept exact so `dbPass`, `bypass`,
  // `signatureAlgorithm`, and `privateKeyId` stay readable.
  "secretaccesskey",
  "awssecretaccesskey",
  "storageaccountkey",
  "sharedaccesskey",
  "storageconnectionstring",
  "databaseconnectionstring",
  "sessionkey",
  "sessionid",
  "pwd",
  "pass",
  "dsn",
  "connectionstring",
  "accountkey",
  "sharedkey",
  "subscriptionkey",
  "encryptionkey",
  "masterkey",
  "jwt",
  "signature",
  "xsignature",
  // AWS SigV4 puts the signature behind a vendor prefix, so the exact
  // `signature` entry does not cover it.
  "xamzsignature",
]);

/**
 * Suffixes that mark a value as a credential regardless of its prefix, such as
 * `appSecret`, `client_secret`, or `x-auth-token`. The suffixes stay
 * noun-shaped on purpose: `tokenCount`, `maxTokens`, and `privateKeyId` are
 * operational fields, not credentials. `token$` rather than `tokens$` keeps
 * `maxTokens` visible; plural nouns are handled by the exact set above.
 *
 * Cloud providers prefix their credential keys, so the exact set carries the
 * normalized prefixed forms: `aws_secret_access_key`, `storage_account_key`,
 * `shared_access_key`, and `storage_connection_string`. A suffix rule cannot
 * catch them — the raw text ends in `key` or `string`, not in the sensitive
 * noun. Identifier fields such as `aws_access_key_id` and `account_key_id`
 * still end in `id` and stay readable.
 */
const SENSITIVE_KEY_SUFFIX_PATTERN =
  /(?:secret|token|password|passwd|passphrase|credential|privatekey|apikey|authorization|cookie)$/;

export const REDACTED_VALUE = "[REDACTED]";

type CredentialTextRedactor = (value: string) => string;

/**
 * Credential shapes that can appear without a `key=value` prefix, such as a
 * bare `Authorization` header value copied into an error message, URL
 * userinfo, or a chat-provider webhook URL. The matchers stay deliberately
 * narrow: prose such as `Bearer token`, operational identifiers such as
 * `disk-space-low`, and ordinary URLs stay visible.
 *
 * The order matters: userinfo runs before the authentication-scheme rule so a
 * credential pasted into a URL password is handled as userinfo first.
 */
const CREDENTIAL_VALUE_REDACTORS: ReadonlyArray<CredentialTextRedactor> = [
  // Chat webhook URLs carry their secret in the path. Capture scheme and host
  // so the same URL inside and outside an assignment converges to one shape.
  (value) =>
    value.replace(/(https?:\/\/hooks\.slack\.com\/services\/)[A-Za-z0-9/_-]+/gi, "$1[REDACTED]"),
  (value) =>
    value.replace(
      /(https?:\/\/open\.(?:feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\/)[A-Za-z0-9-]+/gi,
      "$1[REDACTED]",
    ),
  // Slack app tokens have a fixed prefix. Requiring a plausible body keeps the
  // bare prefix intact when it appears as prose.
  (value) => value.replace(/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, REDACTED_VALUE),
  // URL userinfo password. Keep user and host so operators can still tell
  // which endpoint failed; only the password is replaced.
  redactUrlUserinfo,
  // Authentication schemes in free text. The value must be at least eight
  // characters and contain a digit or symbol, so prose such as
  // `Basic authentication` and `Bearer token` stays readable. Generic `Bot`
  // is omitted on purpose so ordinary English is untouched.
  (value) =>
    value.replace(
      /\b(Bearer|Basic|Token)\s+((?=[A-Za-z0-9._~+/=-]{8,}(?![A-Za-z0-9._~+/=-]))(?=[A-Za-z0-9._~+/=-]*[0-9._~+/=-])[A-Za-z0-9._~+/=-]+)/gi,
      "$1 [REDACTED]",
    ),
];

/**
 * Redacts high-confidence credential values regardless of the surrounding
 * key. Safe to apply more than once: every replacement also fails its own
 * matcher on the next pass.
 */
export function redactCredentialText(value: string): string {
  return CREDENTIAL_VALUE_REDACTORS.reduce((text, redact) => redact(text), value);
}

function isUrlSchemeCharacter(char: string | undefined): boolean {
  return isAsciiLetter(char) || isAsciiDigit(char) || char === "+" || char === "." || char === "-";
}

function isUrlUserCharacter(char: string | undefined): boolean {
  return char !== undefined && !isWhitespace(char) && char !== "/" && char !== "@" && char !== ":";
}

function isUrlPasswordCharacter(char: string | undefined): boolean {
  return char !== undefined && !isWhitespace(char) && char !== "/" && char !== "@";
}

/**
 * The legacy userinfo pattern ended a scheme with `://`, so the regex engine
 * retried every prefix of a long dotted run before giving up — minutes of CPU
 * on a 1 MiB payload. This scan anchors on the separator and walks back over
 * the scheme run once.
 */
function hasUrlSchemeStart(value: string, marker: number): boolean {
  let runStart = marker;
  while (runStart > 0 && isUrlSchemeCharacter(value[runStart - 1])) runStart -= 1;

  for (let index = runStart; index < marker; index += 1) {
    if (isAsciiLetter(value[index]) && (index === 0 || !isWordCharacter(value[index - 1]))) {
      return true;
    }
  }

  return false;
}

/**
 * `\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]*):([^\s/@]+)@` rewritten as a linear
 * scan. Only the password span is replaced, so the scheme, user, and host stay
 * readable for operators. The username may be empty: connection-string URLs
 * such as `redis://:secret@host` carry the whole credential in the password
 * span, so requiring a username would leave the secret in plain text.
 */
function redactUrlUserinfo(value: string): string {
  const length = value.length;
  let output = "";
  let cursor = 0;
  let changed = false;
  let searchFrom = 0;

  while (searchFrom < length) {
    const marker = value.indexOf("://", searchFrom);
    if (marker === -1) break;
    searchFrom = marker + 3;

    if (!hasUrlSchemeStart(value, marker)) continue;

    let index = marker + 3;
    while (index < length && isUrlUserCharacter(value[index])) index += 1;
    // An empty username is still a credential: `redis://:pass@host` and
    // `postgres://:pass@host` put the whole secret in the password span.
    if (value[index] !== ":") continue;

    index += 1;
    const passwordStart = index;
    while (index < length && isUrlPasswordCharacter(value[index])) index += 1;
    if (index === passwordStart || value[index] !== "@") continue;

    output += value.slice(cursor, passwordStart) + REDACTED_VALUE;
    cursor = index;
    searchFrom = index + 1;
    changed = true;
  }

  return changed ? output + value.slice(cursor) : value;
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
    // Search matches the stored raw value, like title and message, but the DTO
    // projection still redacts it: a hit only reveals that the row exists.
    idempotencyKey: event.idempotencyKey === null ? null : redactText(event.idempotencyKey),
    providerMetadata: redactJsonText(event.providerMetadata) as JsonObject,
    rawPayload: redactJsonText(event.rawPayload),
    rawHeaders: redactHeaders(event.rawHeaders),
    routeMatches: event.routeMatches === null ? null : redactRouteMatchResults(event.routeMatches),
  };
}

const WHITESPACE_PATTERN = /\s/;
const LINE_TERMINATORS = new Set(["\n", "\r", "\u2028", "\u2029"]);

const SENSITIVE_KEY_SUFFIXES = [
  "secret",
  "token",
  "password",
  "passwd",
  "passphrase",
  "credential",
  "privatekey",
  "apikey",
  "authorization",
  "cookie",
] as const;

// The longest exact key is `passwordconfirmation` (20 characters), and the
// text pattern allows one separator after every character.
const MAX_EXACT_KEY_RAW_LENGTH = 48;

function isAsciiLetter(char: string | undefined): boolean {
  return (
    char !== undefined &&
    char.length === 1 &&
    ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z"))
  );
}

function isAsciiDigit(char: string | undefined): boolean {
  return char !== undefined && char.length === 1 && char >= "0" && char <= "9";
}

function isWordCharacter(char: string | undefined): boolean {
  return isAsciiLetter(char) || isAsciiDigit(char) || char === "_";
}

function isKeyCharacter(char: string | undefined): boolean {
  return isWordCharacter(char) || char === "." || char === "-";
}

function isKeySeparator(char: string | undefined): boolean {
  return char === "." || char === "_" || char === "-";
}

// `_` is an ASCII word character, so it cannot create the `\b` transition the
// legacy pattern needed before a key; `.` and `-` can.
function isBoundarySeparator(char: string | undefined): boolean {
  return char === "." || char === "-";
}

function isWhitespace(char: string | undefined): boolean {
  if (char === undefined) return false;

  return (
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === "\f" ||
    char === "\v" ||
    (char > "\u007f" && WHITESPACE_PATTERN.test(char))
  );
}

/**
 * `[A-Za-z0-9._-]*(?:secret|token|...)` anchored at the end of the value. The
 * prefix is unbounded on purpose: a credential behind a long identifier is
 * still a credential, and bounding it would silently narrow redaction.
 */
function endsWithSensitiveKeySuffix(value: string, start: number): boolean {
  const remainderLength = value.length - start;

  return SENSITIVE_KEY_SUFFIXES.some((suffix) => {
    if (remainderLength < suffix.length) return false;

    const suffixStart = value.length - suffix.length;
    for (let index = 0; index < suffix.length; index += 1) {
      if (value[suffixStart + index]?.toLowerCase() !== suffix[index]) return false;
    }

    return true;
  });
}

/**
 * The exact-key branch of the legacy text pattern: each key character may be
 * followed by at most one `[._-]`, so `webhook_url` matches while
 * `web__hookurl` stays an operational field.
 */
function matchesExactKeyShape(value: string, start: number): boolean {
  const remaining = value.length - start;
  if (remaining <= 0 || remaining > MAX_EXACT_KEY_RAW_LENGTH) return false;

  let normalized = "";
  for (let index = start; index < value.length; index += 1) {
    const char = value[index]?.toLowerCase();
    if (isAsciiLetter(char) || isAsciiDigit(char)) normalized += char;
  }

  if (!SENSITIVE_EXACT_KEYS.has(normalized)) return false;

  let index = start;
  for (let position = 0; position < normalized.length; position += 1) {
    if (value[index]?.toLowerCase() !== normalized[position]) return false;
    index += 1;
    if (position < normalized.length - 1 && isKeySeparator(value[index])) index += 1;
  }

  return index === value.length;
}

function matchesSensitiveKeyRemainder(value: string, start: number): boolean {
  return endsWithSensitiveKeySuffix(value, start) || matchesExactKeyShape(value, start);
}

/**
 * An unquoted key may match from a later word boundary inside the run, because
 * the legacy pattern's `\b` only required a word/non-word transition. This is
 * what keeps `foo.webhook_url=secret` redacted while a 100-character prefix
 * glued directly to `webhook_url` stays visible.
 */
function matchesUnquotedSensitiveKey(value: string): boolean {
  const suffixMatches = endsWithSensitiveKeySuffix(value, 0);

  if (isWordCharacter(value[0]) && (suffixMatches || matchesExactKeyShape(value, 0))) {
    return true;
  }

  const exactStart = Math.max(1, value.length - MAX_EXACT_KEY_RAW_LENGTH);
  for (let index = exactStart; index < value.length; index += 1) {
    if (!isBoundarySeparator(value[index - 1]) || !isWordCharacter(value[index])) continue;
    if (suffixMatches || matchesExactKeyShape(value, index)) return true;
  }

  if (suffixMatches && !isWordCharacter(value[0])) {
    for (let index = 1; index < value.length; index += 1) {
      if (isBoundarySeparator(value[index - 1]) && isWordCharacter(value[index])) return true;
    }
  }

  return false;
}

function endsAtValueDelimiter(value: string, start: number): boolean {
  // `(?:\s*[,;}\]\n\r]|$)` is greedier than it looks: when whitespace
  // follows the closing quote, `$` is tested before that whitespace, so
  // `token="abc" ` falls back to the unquoted branch while `token="abc"` does
  // not. Reproduce both alternatives in that order.
  let index = start;
  while (index < value.length && isWhitespace(value[index])) {
    // A line break inside the whitespace run can be the delimiter itself.
    if (value[index] === "\n" || value[index] === "\r") return true;
    index += 1;
  }

  if (index < value.length) {
    const char = value[index];

    return char === "," || char === ";" || char === "}" || char === "]";
  }

  return start >= value.length;
}

function readQuotedValue(value: string, start: number): { end: number; quote: string } | null {
  const quote = value[start];
  if (quote !== '"' && quote !== "'") return null;

  let index = start + 1;
  while (index < value.length) {
    const char = value[index];

    if (char === "\\") {
      const escaped = value[index + 1];
      // The legacy `\\.` escape cannot cross a line terminator.
      if (escaped === undefined || LINE_TERMINATORS.has(escaped)) return null;
      index += 2;
      continue;
    }

    if (char === quote) {
      const end = index + 1;
      return endsAtValueDelimiter(value, end) ? { end, quote } : null;
    }

    index += 1;
  }

  return null;
}

/**
 * `\s+["']?KEY["']?\s*[:=]`, where the lookahead's KEY has no `\b`, so a
 * sensitive key may start with a separator. Checking once at the start of a
 * whitespace run is equivalent to checking every position in it and keeps the
 * value scan linear.
 */
function startsSensitiveAssignment(value: string, start: number): boolean {
  let index = start;

  if (value[index] === '"' || value[index] === "'") index += 1;

  const keyStart = index;
  while (index < value.length && isKeyCharacter(value[index])) index += 1;
  if (index === keyStart) return false;

  const key = value.slice(keyStart, index);

  if (value[index] === '"' || value[index] === "'") index += 1;
  while (index < value.length && isWhitespace(value[index])) index += 1;

  return (value[index] === ":" || value[index] === "=") && matchesSensitiveKeyRemainder(key, 0);
}

function readUnquotedValueEnd(value: string, start: number): number {
  let index = start;

  while (index < value.length) {
    const char = value[index];

    if (char === "," || char === ";" || char === "\n" || char === "\r") break;

    if (isWhitespace(char)) {
      let whitespaceEnd = index;
      while (whitespaceEnd < value.length && isWhitespace(value[whitespaceEnd])) {
        whitespaceEnd += 1;
      }

      // `\s+KEY` may span a line break, so it is checked before the line
      // break terminates the value; then the whitespace before the break stays
      // inside the value, as the lazy unquoted branch did.
      if (startsSensitiveAssignment(value, whitespaceEnd)) break;

      let lineBreak = index;
      while (lineBreak < whitespaceEnd && value[lineBreak] !== "\n" && value[lineBreak] !== "\r") {
        lineBreak += 1;
      }

      if (lineBreak < whitespaceEnd) {
        index = lineBreak;
        break;
      }

      index = whitespaceEnd;
      continue;
    }

    index += 1;
  }

  return index;
}

function parseRedactedValue(value: string, start: number): { end: number; replacement: string } {
  const quoted = readQuotedValue(value, start);
  if (quoted !== null) {
    return {
      end: quoted.end,
      replacement: `${quoted.quote}${REDACTED_VALUE}${quoted.quote}`,
    };
  }

  const end = readUnquotedValueEnd(value, start);
  const quote = quotedFallback(value.slice(start, end));

  return {
    end,
    replacement: quote ? `${quote}${REDACTED_VALUE}${quote}` : REDACTED_VALUE,
  };
}

/**
 * Redacts `key=value` assignments in free text.
 *
 * The previous implementation let the regex engine search every prefix of a
 * long identifier for a sensitive suffix, so an adversarial payload made the
 * cost grow with the square of its length (80 KiB took seconds; a 1 MiB
 * webhook could pin the single-process worker for minutes). This scanner
 * walks the text once, records the value span for each sensitive key, and
 * applies the edits in a single pass. Key matching deliberately mirrors the
 * legacy alternation, including its one-separator exact keys and its `\b`
 * rules, so which values are hidden does not change.
 */
function redactSensitiveAssignments(value: string): string {
  const length = value.length;
  let output = "";
  let cursor = 0;
  let changed = false;
  let index = 0;

  while (index < length) {
    const openingQuote = value[index] === '"' || value[index] === "'" ? value[index] : "";
    const keyStart = openingQuote ? index + 1 : index;

    if (!isKeyCharacter(value[keyStart])) {
      index += 1;
      continue;
    }

    let keyEnd = keyStart;
    while (keyEnd < length && isKeyCharacter(value[keyEnd])) keyEnd += 1;
    const key = value.slice(keyStart, keyEnd);

    // A quote that is not closed is not part of the match: the legacy pattern
    // could still start at the key itself, with the quote left untouched.
    const quotedKey = openingQuote !== "" && value[keyEnd] === openingQuote;
    let afterKey = quotedKey ? keyEnd + 1 : keyEnd;

    while (afterKey < length && isWhitespace(value[afterKey])) afterKey += 1;
    if (value[afterKey] !== ":" && value[afterKey] !== "=") {
      index = keyEnd;
      continue;
    }
    afterKey += 1;
    while (afterKey < length && isWhitespace(value[afterKey])) afterKey += 1;

    const sensitive = quotedKey
      ? isWordCharacter(value[keyStart]) && matchesSensitiveKeyRemainder(key, 0)
      : matchesUnquotedSensitiveKey(key);

    if (!sensitive) {
      // The legacy pattern only matched sensitive keys, so scanning continues
      // inside the value and still finds a nested `token=...`.
      index = afterKey;
      continue;
    }

    const parsed = parseRedactedValue(value, afterKey);
    output += value.slice(cursor, afterKey) + parsed.replacement;
    cursor = parsed.end;
    index = parsed.end;
    changed = true;
  }

  return changed ? output + value.slice(cursor) : value;
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
