import { useNow } from "#/i18n/use-i18n";

/** Suppression windows and retry backoffs are minute-grained; 30s keeps them honest. */
export const OPERATIONAL_CLOCK_REFRESH_MS = 30_000;

/**
 * The console clock for anything derived from the current instant.
 *
 * `useNow()` freezes at mount unless it is given an interval, so suppression
 * badges, the operational sort order, toggle copy, and cross-day retry labels
 * would otherwise keep describing the moment the page was opened. Every
 * surface that says "now" must read this hook instead of `useNow()`.
 */
export function useOperationalNow(updateInterval = OPERATIONAL_CLOCK_REFRESH_MS): Date {
  return useNow({ updateInterval });
}
