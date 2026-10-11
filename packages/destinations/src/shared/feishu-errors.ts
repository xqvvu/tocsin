/**
 * Feishu open platform error taxonomy.
 *
 * Source: 服务端通用错误码
 * (https://open.feishu.cn/document/ukTMukTMukTM/ugjM14COyUjL4ITN) and the
 * per-endpoint error tables of the message send / urgent APIs
 * (https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create,
 * .../reference/im-v1/message/urgent_phone). The platform answers almost every
 * business rejection with HTTP 400 and a non-zero `code`, and a few codes are
 * transient (rate limit, too many unread urgent messages), so the HTTP status
 * alone cannot decide retryability.
 */
import type { DestinationErrorKind, DestinationRetryHint } from "#destinations/types";

export interface FeishuErrorDecision {
  retryHint: DestinationRetryHint;
  /**
   * What an operator should do about it, when the platform code has a known
   * remedy. The console surfaces this in the delivery/ping error text.
   */
  operatorHint: string | null;
}

/**
 * Codes the platform itself says a later call can clear. Everything else that
 * comes back non-zero is treated as a rejection: retrying an unconfigured app,
 * a dissolved group, or an exhausted 加急额度 only burns more calls.
 */
const RETRY_TRANSIENT_CODES: ReadonlySet<number> = new Set([
  /** 99991400 request trigger frequency limit — 建议指数退避后重试. */
  99991400,
  /** 11232/11233 创建消息触发系统超限 — send-message rate limits. */
  11232, 11233,
  /** 230023 未读加急过多 — clears once the receiver reads their urgent messages. */
  230023,
]);

/** Platform codes that mean "an expired or wrong token was used" — a fresh token can fix them. */
const INVALID_TENANT_TOKEN_CODES: ReadonlySet<number> = new Set([99991661, 99991663, 99991665]);

/**
 * Codes whose documented remedy is "fetch the credential again".
 *
 * Source: 服务端通用错误码 — 99991663 tells the caller to re-obtain the
 * `tenant_access_token`, so a later attempt with a fresh token can succeed.
 */
const RETRYABLE_CODES: ReadonlySet<number> = INVALID_TENANT_TOKEN_CODES;

/** Configuration/prereq problems an operator has to fix in Feishu before this can ever work. */
const OPERATOR_HINTS: ReadonlyMap<number, string> = new Map([
  [
    10003,
    "Check the app id and secret — the platform rejected a request parameter (invalid parameter)",
  ],
  [10014, "The app is not in a usable state; check whether it is disabled (应用状态不可用)"],
  [11236, "The user has left the company (用户已离职)"],
  [
    99991663,
    "The tenant access token was rejected or has expired; re-check the app credential (凭证无效或已过期)",
  ],
  [
    230001,
    // Shared code: on the send endpoint it is any invalid parameter, on the
    // urgent endpoints the documented trigger is that *every* receiver id was
    // invalid. The hint names the paging case because that is the costly one.
    "A request parameter was rejected; for urgent calls this means every receiver id was invalid — ids must match the configured user id type and every receiver must be in the chat (参数错误 / 接收人 ID 全部无效)",
  ],
  [230002, "Add the app's bot to the target group before paging or sending (机器人不在群内)"],
  [230006, "Enable the bot ability for this Feishu app (未开启机器人能力)"],
  [
    230012,
    "Only the app that sent the message can page it; check the destination references the sending app (机器人不是消息发送者)",
  ],
  [
    230013,
    "The receiver is outside the app's availability scope or has left the company (用户不在应用可用范围内)",
  ],
  [230025, "The rendered card exceeds the platform's message-size limit (卡片消息最大 30 KB)"],
  [
    230023,
    "The receiver has too many unread urgent messages; they must read them before the next page",
  ],
  [
    230024,
    "The tenant's urgent-message quota is exhausted; ask the Feishu administrator about 加急额度",
  ],
  [
    230027,
    "This operation is not permitted here — an external group needs the bot's external sharing ability, or the app is missing a permission",
  ],
  [
    230052,
    "The group only allows the owner/admins to page, or the call was flagged as risky (仅群主或管理员可加急)",
  ],
  [230098, "Folded (聚合) messages cannot be paged"],
  [230110, "The message was deleted, so it can no longer be paged"],
  [232009, "The group has been dissolved"],
  [99991401, "The server egress IP is outside the app's IP whitelist"],
  [
    99991672,
    "Apply for the permission this endpoint needs — sending needs im:message or im:message:send_as_bot, urgent phone needs im:message.urgent:phone, user_id receivers also need contact:user.employee_id:readonly (未申请 API 权限)",
  ],
  [99991673, "The app is not installed or not available in this tenant (unauthorized app)"],
  [99991403, "The tenant's monthly API call quota is exhausted; upgrade the Feishu plan"],
  [99991400, "Feishu is rate limiting this app; the queue backs off, keep the call rate lower"],
]);

/**
 * Maps a Feishu business error code onto the package's retry vocabulary.
 *
 * Unknown non-zero codes stay `not_retryable`: the platform rejects a request
 * it cannot serve, and a blind retry re-posts cards or re-dials phones.
 */
export function feishuErrorDecision(
  code: number | null,
  httpStatus: number | null,
): FeishuErrorDecision {
  const operatorHint = code === null ? null : (OPERATOR_HINTS.get(code) ?? null);

  if (
    httpStatus === 429 ||
    (code !== null && (RETRY_TRANSIENT_CODES.has(code) || RETRYABLE_CODES.has(code)))
  ) {
    return {
      retryHint: "retryable",
      operatorHint:
        operatorHint ??
        (code !== null && RETRYABLE_CODES.has(code)
          ? "re-check the app credential and let Tocsin exchange a fresh tenant access token"
          : "Feishu is rate limiting or temporarily rejecting this call"),
    };
  }

  return { retryHint: "not_retryable", operatorHint };
}

/**
 * Whether a cached tenant access token should be dropped after this failure.
 *
 * Documented for the token endpoint: an expired `tenant_access_token` surfaces
 * as 99991663 / 99991665 on the call that used it, so the caller must fetch a
 * new token instead of replaying the cached one.
 */
export function feishuTokenIsInvalid(code: number | null): code is number {
  return code !== null && INVALID_TENANT_TOKEN_CODES.has(code);
}

/** Appends the operator guidance to a platform message without losing the code. */
export function withOperatorHint(message: string, operatorHint: string | null): string {
  return operatorHint ? `${message}. Fix: ${operatorHint}` : message;
}

/**
 * Whether a failed Feishu response is a *business rejection* or a plain HTTP failure.
 *
 * Every endpoint Tocsin calls documents the same shape: business rejections (invalid
 * parameter, bot not in the group, missing scope, exhausted 加急额度, and even the
 * rate limit on legacy endpoints) come back with a non-zero `code` in the body, and
 * most of them are answered with HTTP 400. A gateway or transport failure carries no
 * business code at all. So the code — not the status — tells the two apart: labelling
 * a documented `400 + 230002` as an HTTP error hides the platform's answer behind the
 * wrong `errorKind` in the delivery/ping logs. A body that cannot be parsed, and a body
 * that claims success (`code === 0`) under a failing status, stay `http_error` — in
 * both cases the status is the only thing that actually failed.
 */
export function feishuErrorKind(code: number | null): DestinationErrorKind {
  return code === null || code === 0 ? "http_error" : "target_rejected";
}
