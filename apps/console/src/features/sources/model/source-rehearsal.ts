import type { JsonValue } from "@tocsin/core";

export type RehearsalPayloadParseResult = { ok: true; value: JsonValue } | { ok: false };

/**
 * Parses the operator's webhook body before the rehearsal call.
 *
 * Any valid JSON value is accepted: providers that expect an object normalize a
 * non-object payload themselves, and reporting the real parser failure is more
 * useful than rejecting the body in the browser.
 */
export function parseRehearsalPayload(text: string): RehearsalPayloadParseResult {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) as JsonValue };
  } catch {
    return { ok: false };
  }
}
