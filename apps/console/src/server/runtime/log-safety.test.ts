import type { LogRecord } from "@logtape/logtape";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  redactLogRecord,
  safeErrorProperties,
  withLogRedaction,
} from "#/server/runtime/log-safety";

describe("log safety", () => {
  it("redacts sensitive structured fields and their named placeholders", () => {
    const record = createRecord({
      message: ["Sending token ", "source-secret", " for ", "source-1", ""],
      rawMessage: "Sending token {token} for {sourceId}",
      properties: {
        token: "source-secret",
        sourceId: "source-1",
        dbPwd: "db-secret",
        bypass: true,
        nested: {
          password: "password-secret",
          userPass: "user-secret",
          status: "accepted",
        },
      },
    });

    const redacted = redactLogRecord(record);

    expect(redacted.message).toEqual(["Sending token ", "[REDACTED]", " for ", "source-1", ""]);
    expect(redacted.properties).toEqual({
      token: "[REDACTED]",
      sourceId: "source-1",
      dbPwd: "[REDACTED]",
      bypass: true,
      nested: {
        password: "[REDACTED]",
        userPass: "[REDACTED]",
        status: "accepted",
      },
    });
    expect(JSON.stringify(redacted)).not.toContain("source-secret");
    expect(JSON.stringify(redacted)).not.toContain("password-secret");
  });

  it("projects errors without stack or cause and redacts assignments", () => {
    const error = new Error("request failed token=transport-secret");
    error.cause = new Error("database password=database-secret");

    expect(safeErrorProperties(error)).toEqual({
      errorName: "Error",
      errorMessage: "request failed token=[REDACTED]",
    });
    expect(safeErrorProperties(error)).not.toHaveProperty("stack");
    expect(safeErrorProperties(error)).not.toHaveProperty("cause");
  });

  it("redacts before forwarding a record to its sink", () => {
    const sink = vi.fn<(record: LogRecord) => void>();

    withLogRedaction(sink)(
      createRecord({
        properties: {
          authorization: "Bearer credential",
          eventId: "event-1",
        },
      }),
    );

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: {
          authorization: "[REDACTED]",
          eventId: "event-1",
        },
      }),
    );
  });
});

function createRecord(overrides: Partial<LogRecord>): LogRecord {
  return {
    category: ["tocsin", "test"],
    level: "info",
    message: ["test"],
    rawMessage: "test",
    timestamp: Date.now(),
    properties: {},
    ...overrides,
  };
}
