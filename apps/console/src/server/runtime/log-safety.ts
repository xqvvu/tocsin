import type { LogRecord, Sink } from "@logtape/logtape";

import { REDACTED_VALUE, isSensitiveKey, redactText } from "@tocsin/core";

const MAX_LOG_VALUE_DEPTH = 8;
const PLACEHOLDER_PATTERN = /\{([^{}]+)\}/g;

export function withLogRedaction(sink: Sink): Sink {
  return (record) => sink(redactLogRecord(record));
}

export function safeErrorProperties(error: unknown): {
  errorName: string;
  errorMessage: string;
} {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: redactText(error.message),
    };
  }

  return {
    errorName: "Error",
    errorMessage: redactText(String(error)),
  };
}

export function redactLogRecord(record: LogRecord): LogRecord {
  const seen = new WeakSet<object>();

  return {
    ...record,
    message: redactLogMessage(record, seen),
    rawMessage:
      typeof record.rawMessage === "string" ? redactText(record.rawMessage) : record.rawMessage,
    properties: redactLogObject(record.properties, seen, 0),
  };
}

function redactLogMessage(record: LogRecord, seen: WeakSet<object>): readonly unknown[] {
  const message = record.message.map((value) => redactLogValue(value, seen, 0));

  if (typeof record.rawMessage !== "string") {
    return message;
  }

  const placeholders = [...record.rawMessage.matchAll(PLACEHOLDER_PATTERN)];

  for (const [index, match] of placeholders.entries()) {
    const propertyPath = match[1];
    const propertyName = propertyPath?.split(".").at(-1);

    if (propertyName && isSensitiveKey(propertyName)) {
      const messageValueIndex = index * 2 + 1;

      if (messageValueIndex < message.length) {
        message[messageValueIndex] = REDACTED_VALUE;
      }
    }
  }

  return message;
}

function redactLogObject(
  value: Record<string, unknown>,
  seen: WeakSet<object>,
  depth: number,
): Record<string, unknown> {
  if (seen.has(value)) {
    return { circular: "[Circular]" };
  }

  if (depth >= MAX_LOG_VALUE_DEPTH) {
    return { truncated: "[MaxDepth]" };
  }

  seen.add(value);

  const redacted = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED_VALUE : redactLogValue(entry, seen, depth + 1),
    ]),
  );

  seen.delete(value);
  return redacted;
}

function redactLogValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return safeErrorProperties(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_LOG_VALUE_DEPTH || seen.has(value)) {
      return depth >= MAX_LOG_VALUE_DEPTH ? "[MaxDepth]" : "[Circular]";
    }

    seen.add(value);
    const redacted = value.map((entry) => redactLogValue(entry, seen, depth + 1));
    seen.delete(value);
    return redacted;
  }

  if (typeof value === "object") {
    return redactLogObject(value as Record<string, unknown>, seen, depth);
  }

  if (typeof value === "function") {
    return value.name ? `[Function ${value.name}]` : "[Function]";
  }

  return typeof value === "symbol" ? `[Symbol ${value.description ?? ""}]` : "[Unsupported]";
}
