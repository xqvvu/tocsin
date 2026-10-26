import { describe, expect, it } from "vite-plus/test";

import {
  DELIVERY_ACCEPTED_UNRECORDED_ERROR,
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
