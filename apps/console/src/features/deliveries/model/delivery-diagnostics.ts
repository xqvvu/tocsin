import type { DeliveryAttempt, DeliveryJob } from "@tocsin/core";

import {
  formatDurationBetween,
  formatDurationMs,
} from "#/features/operations/model/operation-format";

export interface DeliveryTimingSummary {
  /** `job.createdAt` → first attempt start: time spent waiting for a worker slot. */
  queueLatency: string | null;
  /**
   * Sum of every finished attempt. Retries back off between attempts, so this
   * is send time only and never includes the queue or backoff waits.
   */
  sendDuration: string | null;
  /** `job.createdAt` → `job.finishedAt`; only meaningful once the job is terminal. */
  endToEndDuration: string | null;
}

export function summarizeDeliveryTiming(
  job: Pick<DeliveryJob, "createdAt" | "finishedAt">,
  attempts: DeliveryAttempt[],
): DeliveryTimingSummary {
  const firstAttemptStartedAt = earliestStart(attempts);
  const finishedDurations = attempts.flatMap((attempt) => {
    const duration = elapsedMs(attempt.startedAt, attempt.finishedAt);

    return duration === null ? [] : [duration];
  });

  return {
    queueLatency:
      firstAttemptStartedAt === null
        ? null
        : formatDurationBetween(job.createdAt, firstAttemptStartedAt),
    sendDuration:
      finishedDurations.length === 0
        ? null
        : formatDurationMs(finishedDurations.reduce((total, value) => total + value, 0)),
    endToEndDuration: formatDurationBetween(job.createdAt, job.finishedAt),
  };
}

export function attemptDuration(
  attempt: Pick<DeliveryAttempt, "startedAt" | "finishedAt">,
): string | null {
  return formatDurationBetween(attempt.startedAt, attempt.finishedAt);
}

function earliestStart(attempts: DeliveryAttempt[]): string | null {
  let earliest: { iso: string; ms: number } | null = null;

  for (const attempt of attempts) {
    const ms = Date.parse(attempt.startedAt);

    if (!Number.isFinite(ms) || (earliest !== null && ms >= earliest.ms)) {
      continue;
    }

    earliest = { iso: attempt.startedAt, ms };
  }

  return earliest?.iso ?? null;
}

function elapsedMs(startIso: string, endIso: string | null): number | null {
  if (!endIso) {
    return null;
  }

  const start = Date.parse(startIso);
  const end = Date.parse(endIso);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return end - start;
}
