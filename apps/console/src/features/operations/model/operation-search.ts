import { pickBy } from "es-toolkit/object";
import { z } from "zod";

import type { AlertSeverity, AlertStatus, DeliveryState } from "@tocsin/core";
import { AlertSeveritySchema, AlertStatusSchema, DeliveryStateSchema } from "@tocsin/core";

export const DashboardOperationSearchSchema = z.object({
  sourceId: z.string().catch("").optional(),
  severity: z
    .union([AlertSeveritySchema, z.literal("")])
    .catch("")
    .optional(),
  status: z
    .union([AlertStatusSchema, z.literal("")])
    .catch("")
    .optional(),
  destinationId: z.string().catch("").optional(),
  deliveryState: z
    .union([DeliveryStateSchema, z.literal("")])
    .catch("")
    .optional(),
  q: z.string().catch("").optional(),
  eventPage: z.coerce.number().int().min(1).catch(1).optional(),
  deliveryCursor: z.string().catch("").optional(),
  /**
   * Every page visited so far in the deliveries list, in order, ending with the
   * page on screen. Cursor paging cannot derive its own history — the server
   * only ever hands back "the next page" — so "Previous" needs this trail or it
   * would be a button that lies. It lives in the URL with the rest of the list
   * state, so reloading or sharing the link reproduces the same page.
   *
   * Encoded by `encodeCursorTrail`; see there for the wire format.
   */
  deliveryCursorTrail: z.string().catch("").optional(),
});

export interface DashboardOperationSearch {
  sourceId?: string;
  severity?: AlertSeverity | "";
  status?: AlertStatus | "";
  destinationId?: string;
  deliveryState?: DeliveryState | "";
  q?: string;
  eventPage?: number;
  deliveryCursor?: string;
  deliveryCursorTrail?: string;
}

export type OperationFilterData = {
  sourceId?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  destinationId?: string;
  deliveryState?: DeliveryState;
  q?: string;
  eventPage?: number;
  deliveryCursor?: string;
};

/**
 * Cursor-trail helpers for the deliveries list.
 *
 * A cursor-paged list can only go forward on its own: the server answers "the
 * next page" and nothing else. "Previous" is therefore the caller's job, and it
 * needs a record of where it came from.
 *
 * Wire format: the cursors joined by `|`. A cursor is itself
 * `encodeURIComponent(time)|encodeURIComponent(id)` (see `encodeHistoryCursor`),
 * so a cursor occupies exactly two `|`-separated segments and never contains an
 * empty one. Page 1 has no cursor at all, and is written as the literal
 * `start` — a single segment, and never mistakable for an encoded timestamp
 * (which always begins with a digit).
 */
const TRAIL_START = "start";

export function decodeCursorTrail(trail: string | undefined): string[] {
  if (!trail) return [""];

  const segments = trail.split("|");
  const cursors: string[] = [];

  for (let index = 0; index < segments.length;) {
    if (segments[index] === TRAIL_START) {
      cursors.push("");
      index += 1;
      continue;
    }

    const time = segments[index];
    const id = segments[index + 1];

    if (!time || !id) break;
    cursors.push(`${time}|${id}`);
    index += 2;
  }

  return cursors.length > 0 ? cursors : [""];
}

export function encodeCursorTrail(cursors: readonly string[]): string {
  // Page 1 alone carries no information, so keep it out of the URL rather than
  // writing a `=start` that means nothing.
  if (cursors.length <= 1) return "";

  return cursors.map((cursor) => (cursor === "" ? TRAIL_START : cursor)).join("|");
}

export function operationFiltersFromSearch(search: DashboardOperationSearch): OperationFilterData {
  return pruneSearch(search) as OperationFilterData;
}

export function pruneSearch(search: DashboardOperationSearch): DashboardOperationSearch {
  return pickBy(
    {
      ...search,
      q: search.q?.trim(),
      eventPage: search.eventPage && search.eventPage > 1 ? search.eventPage : undefined,
    },
    (value) =>
      (typeof value === "string" && value.length > 0) ||
      (typeof value === "number" && Number.isFinite(value)),
  ) as DashboardOperationSearch;
}

export function mergeOperationSearch(
  search: DashboardOperationSearch,
  next: Partial<DashboardOperationSearch>,
): DashboardOperationSearch {
  const filterKeys: Array<keyof DashboardOperationSearch> = [
    "sourceId",
    "severity",
    "status",
    "destinationId",
    "deliveryState",
    "q",
  ];
  const filterChanged = filterKeys.some((key) => Object.hasOwn(next, key));

  return pruneSearch({
    ...search,
    ...next,
    // A filter change starts a fresh result set, so any cursor trail from the
    // previous one is meaningless. Dropping `deliveryCursor` alone would leave
    // a stale trail behind and make "Previous" appear on the new first page.
    ...(filterChanged ? { eventPage: 1, deliveryCursor: "", deliveryCursorTrail: "" } : {}),
  });
}
