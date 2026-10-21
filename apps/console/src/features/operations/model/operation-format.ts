import * as React from "react";

import { fallbackTimeZone } from "#/i18n/time-zone";
import { useLocale, useTimeZone } from "#/i18n/use-i18n";

export interface OperationDateFormatter {
  formatDateTime: (value: string) => string;
  formatTime: (value: string) => string;
}

export function useOperationDateFormatter(): OperationDateFormatter {
  const locale = useLocale();
  const timeZone = useTimeZone();

  return useOperationDateFormatterForTimeZone(locale, timeZone ?? fallbackTimeZone);
}

function useOperationDateFormatterForTimeZone(
  locale: string,
  timeZone: string,
): OperationDateFormatter {
  return React.useMemo(
    () => ({
      formatDateTime: (value) => formatDateTime(value, { locale, timeZone }),
      formatTime: (value) => formatTime(value, { locale, timeZone }),
    }),
    [locale, timeZone],
  );
}

export function formatTime(value: string, options: DateFormatOptions = {}): string {
  return createDateTimeFormat(options, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateTime(value: string, options: DateFormatOptions = {}): string {
  return createDateTimeFormat(options, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * Compact display format for a retry timestamp. Time alone is what an operator
 * scanning a near-term retry wants, but it becomes ambiguous once the target
 * falls on another calendar day (a blocked retry can sit days in the future),
 * so cross-day values keep the date. The comparison runs in the configured
 * display time zone, the same one the timestamp itself is formatted in.
 */
export function retryTimestampFormat(
  value: string,
  now: Date,
  timeZone: string,
): "dateTime" | "time" {
  const target = Date.parse(value);

  if (!Number.isFinite(target)) {
    return "dateTime";
  }

  const calendarDay = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });

  return calendarDay.format(new Date(target)) === calendarDay.format(now) ? "time" : "dateTime";
}

export function summarizeResponseBody(value: string | null): string {
  if (!value?.trim()) {
    return "—";
  }

  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

/**
 * Compact, operator-facing duration. Units stay untranslated because `ms`,
 * `s`, `m`, `h`, and `d` are the tokens an on-call engineer already reads in
 * logs and dashboards.
 *
 * Returns `null` for an unusable input so callers can render their own empty
 * marker instead of showing `NaN` or a negative duration.
 */
export function formatDurationBetween(startIso: string, endIso: string | null): string | null {
  if (!endIso) {
    return null;
  }

  const start = Date.parse(startIso);
  const end = Date.parse(endIso);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return formatDurationMs(end - start);
}

export function formatDurationMs(durationMs: number): string | null {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  const totalSeconds = durationMs / 1000;

  if (totalSeconds < 59.95) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const seconds = Math.round(totalSeconds);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  }

  const days = Math.floor(hours / 24);

  return `${days}d ${String(hours % 24).padStart(2, "0")}h`;
}

interface DateFormatOptions {
  locale?: string;
  timeZone?: string;
}

function createDateTimeFormat(
  options: DateFormatOptions,
  formatOptions: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(options.locale, {
    ...formatOptions,
    hour12: false,
    timeZone: options.timeZone ?? fallbackTimeZone,
  });
}
