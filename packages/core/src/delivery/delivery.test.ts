import { describe, expect, it } from "vite-plus/test";

import {
  DELIVERY_ACCEPTED_UNRECORDED_ERROR,
  DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR,
  DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR,
  isDeliveryAcceptedUnrecorded,
} from "#core/delivery/delivery";
import { redactText } from "#core/redaction";

describe("delivery accepted but unrecorded marker", () => {
  it("pins the persisted text so rows written before the guard keep matching", () => {
    // Changing this string would silently make already-delivered legacy rows
    // retryable again; edit it only together with a data migration.
    expect(DELIVERY_ACCEPTED_UNRECORDED_ERROR).toBe(
      "The destination accepted the alert, but recording success failed. " +
        "The alert was already delivered — do not resend it.",
    );
  });

  it("stays unchanged through the redaction applied on write and read", () => {
    // The repository writes and reads `last_error` through `redactText`; a
    // marker that redaction rewrites would silently stop matching.
    expect(redactText(DELIVERY_ACCEPTED_UNRECORDED_ERROR)).toBe(DELIVERY_ACCEPTED_UNRECORDED_ERROR);
  });

  it("recognises the marker, including a suffixed copy, and rejects other errors", () => {
    expect(isDeliveryAcceptedUnrecorded(null)).toBe(false);
    expect(isDeliveryAcceptedUnrecorded("connection reset")).toBe(false);
    expect(isDeliveryAcceptedUnrecorded(DELIVERY_ACCEPTED_UNRECORDED_ERROR)).toBe(true);
    expect(isDeliveryAcceptedUnrecorded(`${DELIVERY_ACCEPTED_UNRECORDED_ERROR} (attempt 2)`)).toBe(
      true,
    );
  });
});

describe("delivery outcome unknown marker", () => {
  it("pins both variants so a reworded row keeps saying what happened", () => {
    expect(DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR).toBe(
      "The delivery attempt ended without a recorded result; the target may or may not " +
        "have received the alert. A retry is scheduled automatically.",
    );
    expect(DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR).toBe(
      "The delivery attempt ended without a recorded result; the target may or may not " +
        "have received the alert. Automatic retries stopped; verify with the target " +
        "before retrying.",
    );
  });

  it("survives the redaction applied on write and read", () => {
    expect(redactText(DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR)).toBe(
      DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR,
    );
    expect(redactText(DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR)).toBe(
      DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR,
    );
  });

  it("stays manually retryable, unlike the accepted-but-unrecorded marker", () => {
    // Unknown is not proof of delivery: the retry guard must not match either
    // variant, or an alert that never left the host could never be resent.
    expect(isDeliveryAcceptedUnrecorded(DELIVERY_OUTCOME_UNKNOWN_RETRY_ERROR)).toBe(false);
    expect(isDeliveryAcceptedUnrecorded(DELIVERY_OUTCOME_UNKNOWN_FINAL_ERROR)).toBe(false);
  });
});
