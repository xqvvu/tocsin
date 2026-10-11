import { mapValues } from "es-toolkit/object";

import type { JsonObject, JsonValue } from "#core/json";

const SENSITIVE_KEY_SOURCE =
  "authorization|cookie|set-cookie|x-api-key|api-key|apikey|apiKey|x-tocsin-source-token|x-tocsin-provider-secret|token|access-token|accessToken|refresh-token|refreshToken|secret|password|passwd|webhook_url|webhook-url|webhookUrl|signing_secret|signing-secret|signingSecret|signSecret";
const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|x-api-key|api-key|apikey|apiKey|x-tocsin-source-token|x-tocsin-provider-secret|token|access-token|accessToken|refresh-token|refreshToken|secret|password|passwd|webhook_url|webhook-url|webhookUrl|signing_secret|signing-secret|signingSecret|signSecret)$/i;
const SENSITIVE_TEXT_ASSIGNMENT_PATTERN = new RegExp(
  `\\b(${SENSITIVE_KEY_SOURCE})\\b(\\s*[:=]\\s*)(.*?)(?=\\s+(?:${SENSITIVE_KEY_SOURCE})\\b\\s*[:=]|[,;\\n\\r]|$)`,
  "gi",
);

export const REDACTED_VALUE = "[REDACTED]";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
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
    SENSITIVE_TEXT_ASSIGNMENT_PATTERN,
    (_match, key: string, separator: string) => `${key}${separator}${REDACTED_VALUE}`,
  );
}
