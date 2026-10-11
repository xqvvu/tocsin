import type { JsonObject } from "@tocsin/core";

export function parseFeishuResult(responseBody: string): JsonObject | null {
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isFeishuSuccess(result: JsonObject): boolean {
  return result.code === 0 || result.StatusCode === 0 || result.msg === "success";
}

/**
 * Numeric business code of a Feishu response, or `null` when it is absent or unparseable.
 *
 * The platform mixes numeric codes (`230001`) and, on older endpoints, string
 * status codes, so callers classify through this reader instead of trusting one shape.
 */
export function feishuBusinessCode(result: JsonObject | null): number | null {
  if (!result) {
    return null;
  }

  const code = result.code ?? result.StatusCode;

  if (typeof code === "number" && Number.isFinite(code)) {
    return code;
  }

  if (typeof code === "string" && code.trim() !== "" && Number.isFinite(Number(code))) {
    return Number(code);
  }

  return null;
}

/**
 * The receiver ids a Feishu urgent call silently skipped.
 *
 * Documented behaviour of `urgent_phone` / `urgent_sms` / `urgent_app`: when
 * *some* of the ids are invalid the call still succeeds (`code: 0`) and the
 * invalid ones come back in `data.invalid_user_id_list`. Without this reader a
 * paging queue would record a call that never happened.
 */
export function feishuInvalidUserIds(result: JsonObject | null): string[] {
  if (!result) {
    return [];
  }

  const data = result.data;

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return [];
  }

  const list = (data as JsonObject).invalid_user_id_list;

  if (!Array.isArray(list)) {
    return [];
  }

  return list.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * One readable summary for any failed Feishu response.
 *
 * The platform puts the actionable sentence in `msg`, so it must survive the
 * failure text; the HTTP status is only appended when it is the part that
 * failed, because most Feishu business rejections arrive as HTTP 400 (and the
 * custom-bot webhook even answers them with HTTP 200 plus a body code).
 */
export function feishuFailureSummary(result: JsonObject | null, httpStatus: number): string {
  const code = feishuBusinessCode(result);

  if (code === null || code === 0) {
    return `Feishu returned HTTP ${httpStatus}`;
  }

  const message =
    result && typeof result.msg === "string" && result.msg.trim() ? result.msg.trim() : null;
  const summary = `Feishu returned code ${code}${message ? `: ${message}` : ""}`;
  const ok = httpStatus >= 200 && httpStatus < 300;

  return ok ? summary : `${summary} (HTTP ${httpStatus})`;
}

/**
 * Builds a readable message for a Feishu business rejection (`code !== 0`).
 *
 * Shared by the token client and the urgent phone client so platform
 * rejections surface the platform's own code and message instead of an opaque
 * failure.
 */
export function feishuFailureMessage(result: JsonObject | null, fallback: string): string {
  if (!result) {
    return fallback;
  }

  const code = result.code ?? result.StatusCode;
  const codeText = typeof code === "string" || typeof code === "number" ? String(code) : "unknown";
  const message = typeof result.msg === "string" && result.msg.trim() ? result.msg.trim() : null;

  return message
    ? `Feishu returned code ${codeText}: ${message}`
    : `Feishu returned code ${codeText}`;
}

/**
 * Reads `data.message_id` from a Feishu send-message response.
 *
 * This is the handle a follow-up urgent call acts on, so callers keep it as the
 * delivery's provider reference.
 */
export function feishuMessageId(result: JsonObject | null): string | null {
  if (!result) {
    return null;
  }

  const data = result.data;

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const messageId = (data as JsonObject).message_id;

  return typeof messageId === "string" && messageId.length > 0 ? messageId : null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
