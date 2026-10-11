/**
 * Numeric limits the Feishu open platform validates server-side for the
 * endpoints Tocsin calls. They are enforced here as well so a destination can be
 * saved only in a shape that Feishu will actually accept.
 */

/**
 * The `Content-Type` the platform documents as a fixed value for its JSON
 * endpoints — token exchange, message send, and all three urgent APIs.
 *
 * The official Go SDK sends exactly this string (`core/constants.go`:
 * `defaultContentType = contentTypeJson + "; charset=utf-8"`).
 */
export const FEISHU_JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/**
 * `user_id_list` of the urgent endpoints (`urgent_phone`, `urgent_sms`,
 * `urgent_app`) may hold at most 200 ids per call.
 *
 * Source: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/urgent_phone
 * ("数据校验规则：列表长度不能大于 200").
 */
export const FEISHU_MAX_URGENT_RECEIVERS = 200;

/**
 * A receiver's unread urgent messages cannot exceed this count; beyond it the
 * platform rejects the call with code 230023 until the user reads some.
 */
export const FEISHU_MAX_UNREAD_URGENT_PER_USER = 200;
