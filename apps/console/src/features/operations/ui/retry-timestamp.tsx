import { retryTimestampFormat } from "#/features/operations/model/operation-format";
import { OperationTimestamp } from "#/features/operations/ui/operation-timestamp";
import { fallbackTimeZone } from "#/i18n/time-zone";
import { useNow, useTimeZone } from "#/i18n/use-i18n";

/**
 * A retry timestamp that keeps the date once the backoff crosses into another
 * calendar day. `HH:mm` alone reads as later today, which is the wrong
 * conclusion for a retry parked days out; every surface that shows
 * `nextAttemptAt` has to make that distinction in the operator's time zone.
 */
export function RetryTimestamp({ className, value }: { className?: string; value: string }) {
  const now = useNow();
  const timeZone = useTimeZone() ?? fallbackTimeZone;

  return (
    <OperationTimestamp
      className={className}
      format={retryTimestampFormat(value, now, timeZone)}
      value={value}
    />
  );
}
