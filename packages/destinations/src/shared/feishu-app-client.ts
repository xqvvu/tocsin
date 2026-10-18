import { FEISHU_TENANT_ACCESS_TOKEN_URL } from "#destinations/shared/feishu-endpoints";
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
  parseFeishuResult,
} from "#destinations/shared/feishu-result";
import { isTimeoutError } from "#destinations/transport";
import type {
  DestinationErrorKind,
  DestinationRetryHint,
  DestinationTransportContext,
} from "#destinations/types";
import { Adapter, Send } from "#destinations/utils";

/**
 * Documented lifetime of a `tenant_access_token` (2 h) used as a floor when the
 * response omits `expire`, so a cache never treats a fresh token as already
 * expired and hammers the token endpoint.
 */
const TOKEN_MAX_TTL_SECONDS = 2 * 60 * 60;
/** How long a token is still usable when `expire` is missing or absurd. */
const TOKEN_FALLBACK_TTL_SECONDS = 5 * 60;

export type FeishuTenantAccessTokenResult =
  | {
      ok: true;
      tenantAccessToken: string;
      /** Seconds until the platform considers the token expired; never below {@link TOKEN_FALLBACK_TTL_SECONDS}. */
      expiresInSeconds: number;
    }
  | {
      ok: false;
      errorKind: DestinationErrorKind;
      retryHint: DestinationRetryHint;
      errorMessage: string;
      statusCode: number | null;
      responseBody: string | null;
    };

/**
 * Exchanges a Feishu self-built app credential for a `tenant_access_token`.
 *
 * Shared by the app validation action and the urgency channels. Returns a
 * structured result so callers can surface the platform's own message and keep
 * retry discipline, and uses the injected transport context so tests can drive
 * it with a fake fetch.
 *
 * Platform semantics for the cache (endpoint doc + official SDK's token manager):
 * the token's maximum lifetime is 2 h; calling the endpoint again while more
 * than 30 minutes remain returns *the same* token, and inside the last 30
 * minutes it returns a new one. Callers therefore cache per credential pair and
 * refresh ahead of expiry instead of calling per message.
 */
export async function fetchFeishuTenantAccessToken(
  input: { appId: string; appSecret: string },
  context?: DestinationTransportContext,
): Promise<FeishuTenantAccessTokenResult> {
  const { fetch } = Adapter.getTransportContext(context);

  try {
    const response = await fetch(FEISHU_TENANT_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": FEISHU_JSON_CONTENT_TYPE,
      },
      body: JSON.stringify({ app_id: input.appId, app_secret: input.appSecret }),
    });
    const responseBody = await Send.readResponseBody(response);
    const result = parseFeishuResult(responseBody);
    const code = feishuBusinessCode(result);

    if (!response.ok) {
      const decision = feishuErrorDecision(code, response.status);

      return {
        ok: false,
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
      };
    }

    if (!result || code !== 0) {
      const decision = feishuErrorDecision(code, response.status);

      return {
        ok: false,
        errorKind: "target_rejected",
        retryHint: decision.retryHint,
        errorMessage: withOperatorHint(
          feishuFailureMessage(
            result,
            "Feishu returned an unreadable tenant access token response",
          ),
          decision.operatorHint,
        ),
        statusCode: response.status,
        responseBody,
      };
    }

    const token = result.tenant_access_token;

    if (typeof token !== "string" || token.length === 0) {
      return {
        ok: false,
        errorKind: "target_rejected",
        retryHint: "not_retryable",
        errorMessage: "Feishu tenant access token response was missing the token",
        statusCode: response.status,
        responseBody,
      };
    }

    return {
      ok: true,
      tenantAccessToken: token,
      expiresInSeconds: normalizeTokenExpiry(result.expire),
    };
  } catch (error) {
    return {
      ok: false,
      errorKind: isTimeoutError(error) ? "timeout" : "network_error",
      retryHint: "retryable",
      errorMessage:
        error instanceof Error && error.message.trim()
          ? `Feishu tenant access token request failed: ${error.message}`
          : "Feishu tenant access token request failed",
      statusCode: null,
      responseBody: null,
    };
  }
}

/**
 * Clamps the platform's `expire` into a usable cache TTL.
 *
 * A missing/zero/negative value must not collapse the cache to "expired right
 * now" — that turns every send into a token round trip and invites a rate-limit
 * loop. Values above the documented 2 h maximum are also clamped so a malformed
 * response cannot keep a stale token alive.
 */
function normalizeTokenExpiry(expire: unknown): number {
  const seconds = typeof expire === "number" && Number.isFinite(expire) ? Math.floor(expire) : 0;

  if (seconds <= 0) {
    return TOKEN_FALLBACK_TTL_SECONDS;
  }

  return Math.min(seconds, TOKEN_MAX_TTL_SECONDS);
}
