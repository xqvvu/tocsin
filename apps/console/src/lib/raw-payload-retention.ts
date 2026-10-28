const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RawPayloadRetentionWindow {
  /** ISO instant the retention window closes for this event's raw payload. */
  expiresAt: string;
  retentionDays: number;
  /**
   * True once the window has closed. The payload may still be readable: the
   * sweep runs on ingest and in a post-ingest pass, so a quiet source keeps
   * expired rows until the next webhook arrives.
   */
  expired: boolean;
}

/**
 * When the raw payload retention window closes for one event.
 *
 * Intake prunes against `receivedAt + rawPayloadRetentionDays` (see the
 * `retentionCutoff` calls in `server/intake/intake.service.ts`), so the detail
 * tabs can tell an operator how long evidence export stays possible instead of
 * only reporting pruned / not pruned after the fact.
 *
 * Returns `null` for unusable input so callers can omit the line rather than
 * render `Invalid Date` or a window the server never applied.
 */
export function rawPayloadRetentionWindow(input: {
  receivedAt: string;
  retentionDays: number | undefined;
  now: Date;
}): RawPayloadRetentionWindow | null {
  const { retentionDays } = input;

  if (retentionDays === undefined || !Number.isFinite(retentionDays) || retentionDays <= 0) {
    return null;
  }

  const receivedAtMs = Date.parse(input.receivedAt);

  if (!Number.isFinite(receivedAtMs)) {
    return null;
  }

  const expiresAtMs = receivedAtMs + retentionDays * MS_PER_DAY;

  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    retentionDays,
    expired: input.now.valueOf() >= expiresAtMs,
  };
}
