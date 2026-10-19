import { describe, expect, it } from "vite-plus/test";

import {
  attemptFromRow,
  deliveryFromRow,
} from "#/infra/sqlite/repositories/delivery/delivery.helpers";
import { oncallPingFromRow } from "#/infra/sqlite/repositories/oncall/oncall.helpers";

const now = "2026-06-07T00:00:00.000Z";

// Built from parts so GitHub push protection does not classify the fixture as
// a live webhook URL.
const slackWebhook = [
  "https://hooks.slack.com",
  "services",
  "T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX",
].join("/");
const slackWebhookRedacted = ["https://hooks.slack.com", "services", "[REDACTED]"].join("/");

describe("credential redaction on read", () => {
  it("re-redacts legacy delivery and attempt errors", () => {
    const delivery = deliveryFromRow({
      id: "delivery-1",
      event_id: "event-1",
      destination_id: "destination-1",
      route_id: "route-1",
      state: "failed",
      attempt_count: 1,
      max_attempts: 3,
      next_attempt_at: null,
      last_error: "upstream rejected Bearer legacy-token-1234",
      rendered_payload_json: null,
      provider_ref_type: null,
      provider_ref_value: null,
      suppression_id: null,
      suppressed_at: null,
      suppress_reason: null,
      created_at: now,
      updated_at: now,
      finished_at: now,
    });

    expect(delivery.lastError).toBe("upstream rejected Bearer [REDACTED]");

    const attempt = attemptFromRow({
      id: "attempt-1",
      delivery_id: "delivery-1",
      attempt_number: 1,
      state: "failed",
      response_status: 401,
      response_body: `webhook ${slackWebhook} returned 401`,
      error: "POST https://svc:legacy-password@example.test/hook failed",
      started_at: now,
      finished_at: now,
    });

    expect(attempt.responseBody).toBe(`webhook ${slackWebhookRedacted} returned 401`);
    expect(attempt.error).toBe("POST https://svc:[REDACTED]@example.test/hook failed");
  });

  it("re-redacts legacy oncall errors", () => {
    const ping = oncallPingFromRow({
      id: "ping-1",
      delivery_id: "delivery-1",
      destination_id: "destination-1",
      event_id: "event-1",
      fingerprint: "cpu:api",
      receiver: "+15550000000",
      channel: "voice",
      state: "failed",
      provider_ref_type: null,
      provider_ref_value: null,
      attempt_count: 1,
      max_attempts: 3,
      next_attempt_at: null,
      last_error: "carrier rejected Basic bGVnYWN5OnNlY3JldA==",
      trigger: "auto",
      initiated_by: null,
      suppress_reason: null,
      created_at: now,
      updated_at: now,
      fired_at: null,
    });

    expect(ping.lastError).toBe("carrier rejected Basic [REDACTED]");
  });

  it("keeps benign legacy errors untouched", () => {
    const delivery = deliveryFromRow({
      id: "delivery-2",
      event_id: "event-1",
      destination_id: "destination-1",
      route_id: null,
      state: "failed",
      attempt_count: 1,
      max_attempts: 3,
      next_attempt_at: null,
      last_error: "severity disk-space-low with max_tokens: 4096",
      rendered_payload_json: null,
      provider_ref_type: null,
      provider_ref_value: null,
      suppression_id: null,
      suppressed_at: null,
      suppress_reason: null,
      created_at: now,
      updated_at: now,
      finished_at: now,
    });

    expect(delivery.lastError).toBe("severity disk-space-low with max_tokens: 4096");
  });
});
