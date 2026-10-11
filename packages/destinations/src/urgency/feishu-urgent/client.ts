import { FEISHU_MESSAGES_URL } from "#destinations/shared/feishu-endpoints";
import {
  feishuErrorDecision,
  feishuErrorKind,
  withOperatorHint,
} from "#destinations/shared/feishu-errors";
import { FEISHU_JSON_CONTENT_TYPE } from "#destinations/shared/feishu-protocol";
import {
  feishuBusinessCode,
  feishuFailureMessage,
  feishuFailureSummary,
  feishuInvalidUserIds,
  parseFeishuResult,
} from "#destinations/shared/feishu-result";
import type {
  DestinationErrorKind,
  DestinationRetryHint,
  DestinationTransportContext,
} from "#destinations/types";
import { Adapter, Send } from "#destinations/utils";

export interface FeishuUrgentPhoneCall {
  tenantAccessToken: string;
  messageId: string;
  receivers: string[];
  userIdType: "open_id" | "user_id" | "union_id";
}

export type FeishuUrgentPhoneCallResult =
  | { ok: true; statusCode: number; responseBody: string }
  | {
      ok: false;
      errorKind: DestinationErrorKind;
      retryHint: DestinationRetryHint;
      errorMessage: string;
      statusCode: number | null;
      responseBody: string | null;
      /** Business code of the rejection, when the platform sent one; callers use it to classify. */
      code?: number | null;
    };

/**
 * Asks Feishu to urgent-call the receivers about an existing message
 * (`PATCH /open-apis/im/v1/messages/:message_id/urgent_phone`).
 *
 * Request shape follows the endpoint doc and both official SDKs: the body is the
 * flat `{ user_id_list }` object (the Go SDK's `UrgentReceivers` type is the
 * body *model*, not a wrapper key) and `user_id_type` is a required query
 * parameter whose values must match the id shape in that list.
 *
 * The message must be one the app itself sent, in a chat the bot belongs to;
 * the platform rejects anything else. Retryability is decided by the platform
 * code, not by HTTP status alone, because Feishu answers rate limits with a
 * business code (99991400, HTTP 429 or on legacy endpoints 400) and answers
 * configuration problems with a plain HTTP 400 that a retry can never fix.
 */
export async function callFeishuUrgentPhone(
  input: FeishuUrgentPhoneCall,
  context?: DestinationTransportContext,
): Promise<FeishuUrgentPhoneCallResult> {
  const { fetch } = Adapter.getTransportContext(context);
  const url = `${FEISHU_MESSAGES_URL}/${encodeURIComponent(input.messageId)}/urgent_phone?user_id_type=${input.userIdType}`;

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": FEISHU_JSON_CONTENT_TYPE,
        Authorization: `Bearer ${input.tenantAccessToken}`,
      },
      body: JSON.stringify({ user_id_list: input.receivers }),
    });
    const responseBody = await Send.readResponseBody(response);
    const result = parseFeishuResult(responseBody);
    const code = feishuBusinessCode(result);

    if (!response.ok) {
      const decision = feishuErrorDecision(code, response.status);

      return {
        ok: false,
        // Documented: the urgent endpoints answer every business rejection with
        // HTTP 400 plus a code, so a code in the body means the platform refused
        // the call rather than the transport failing.
        errorKind: feishuErrorKind(code),
        retryHint:
          decision.retryHint === "retryable"
            ? "retryable"
            : Send.httpStatusToRetryHint(response.status),
        errorMessage: withOperatorHint(
          feishuFailureSummary(result, response.status),
          decision.operatorHint,
        ),
        statusCode: response.status,
        responseBody,
        code,
      };
    }

    if (!result || code !== 0) {
      const decision = feishuErrorDecision(code, response.status);

      return {
        ok: false,
        errorKind: "target_rejected",
        retryHint: decision.retryHint,
        errorMessage: withOperatorHint(
          feishuFailureMessage(result, "Feishu returned an unreadable urgent phone response"),
          decision.operatorHint,
        ),
        statusCode: response.status,
        responseBody,
        code,
      };
    }

    // Partial success is documented as `code: 0` plus the ids it skipped. Tocsin
    // pages one receiver per ping, so any skipped id means this ping never rang
    // and must not be recorded as fired. When more than one receiver is in the
    // call, only a skipped id that belongs to this call's receivers is held
    // against it (the platform echoes the id back, but the shape is not
    // guaranteed, so a single-receiver call fails on any non-empty list).
    const skipped = feishuInvalidUserIds(result);
    const invalid = skipped.filter((id) => input.receivers.includes(id));

    if (invalid.length > 0 || (input.receivers.length === 1 && skipped.length > 0)) {
      return {
        ok: false,
        errorKind: "target_rejected",
        retryHint: "not_retryable",
        errorMessage: withOperatorHint(
          `Feishu skipped these urgent receivers: ${(invalid.length > 0 ? invalid : skipped).join(", ")}`,
          "The receiver must be a member of the chat the message was sent to, with an id matching the configured user id type",
        ),
        statusCode: response.status,
        responseBody,
        code,
      };
    }

    return { ok: true, statusCode: response.status, responseBody };
  } catch (error) {
    return {
      ok: false,
      errorKind: "network_error",
      retryHint: "retryable",
      errorMessage:
        error instanceof Error && error.message.trim()
          ? `Feishu urgent phone request failed: ${error.message}`
          : "Feishu urgent phone request failed",
      statusCode: null,
      responseBody: null,
    };
  }
}
