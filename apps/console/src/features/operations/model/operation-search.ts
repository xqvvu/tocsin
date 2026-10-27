import { pickBy } from "es-toolkit/object";
import { z } from "zod";

import type {
  AlertSeverity,
  AlertStatus,
  DeliveryReceiptFilter,
  DeliveryState,
  DeliveryTimeField,
  DestinationKind,
  EventDeliveryOutcome,
  EventDestinationMatch,
  OperationTimeRange,
} from "@tocsin/core";
import {
  AlertSeveritySchema,
  AlertStatusSchema,
  DeliveryReceiptFilterSchema,
  DeliveryStateSchema,
  DeliveryTimeFieldSchema,
  DestinationKindSchema,
  EventDeliveryOutcomeSchema,
  EventDestinationMatchSchema,
  OperationTimeRangeSchema,
  OPERATION_SEARCH_MAX_LENGTH,
} from "@tocsin/core";

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
  // Events-only fan-out outcome: `none` is "produced no delivery at all",
  // every other value is "has at least one delivery in that state".
  deliveryOutcome: z
    .union([EventDeliveryOutcomeSchema, z.literal("")])
    .catch("")
    .optional(),
  destinationId: z.string().catch("").optional(),
  // Events-only: whether the alert reached the selected destination. Empty
  // means the server default (`delivered`); the URL only carries `missing`,
  // which is the case no delivery-level filter can find.
  destinationMatch: z
    .union([EventDestinationMatchSchema, z.literal("")])
    .catch("")
    .optional(),
  destinationKind: z
    .union([DestinationKindSchema, z.literal("")])
    .catch("")
    .optional(),
  routeId: z.string().catch("").optional(),
  // Delivery-only: whether the target returned a message reference. The URL is
  // user-editable, so an unknown value means "any receipt" instead of an error.
  receipt: z
    .union([DeliveryReceiptFilterSchema, z.literal("")])
    .catch("")
    .optional(),
  deliveryState: z
    .union([DeliveryStateSchema, z.literal("")])
    .catch("")
    .optional(),
  // Delivery-only lower bound on how many times the job has been attempted.
  // 0 means "any"; the UI offers 1/2/3 presets, but the URL is user-editable,
  // so anything outside the range falls back to "any" instead of throwing.
  minAttempts: z.coerce.number().int().min(1).max(100).catch(0).optional(),
  range: z
    .union([OperationTimeRangeSchema, z.literal("")])
    .catch("")
    .optional(),
  // Delivery-only: whether `range` measures from enqueue time or last
  // activity. Empty means the default (`created`), so links stay short.
  timeField: z
    .union([DeliveryTimeFieldSchema, z.literal("")])
    .catch("")
    .optional(),
  // The instant the operator opened the window. Without it the server resolves
  // the window against each request, so paging or reopening a shared link moves
  // the lower bound and rows shift between pages.
  rangeAnchor: z
    .string()
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)))
    .catch("")
    .optional(),
  q: z.string().catch("").optional(),
  eventPage: z.coerce.number().int().min(1).catch(1).optional(),
  deliveryPage: z.coerce.number().int().min(1).catch(1).optional(),
});

export interface DashboardOperationSearch {
  sourceId?: string;
  severity?: AlertSeverity | "";
  status?: AlertStatus | "";
  deliveryOutcome?: EventDeliveryOutcome | "";
  destinationId?: string;
  destinationMatch?: EventDestinationMatch | "";
  destinationKind?: DestinationKind | "";
  routeId?: string;
  receipt?: DeliveryReceiptFilter | "";
  deliveryState?: DeliveryState | "";
  minAttempts?: number;
  range?: OperationTimeRange | "";
  timeField?: DeliveryTimeField | "";
  rangeAnchor?: string;
  q?: string;
  eventPage?: number;
  deliveryPage?: number;
}

export type OperationFilterData = {
  sourceId?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  deliveryOutcome?: EventDeliveryOutcome;
  destinationId?: string;
  destinationMatch?: EventDestinationMatch;
  destinationKind?: DestinationKind;
  routeId?: string;
  receipt?: DeliveryReceiptFilter;
  deliveryState?: DeliveryState;
  minAttempts?: number;
  range?: OperationTimeRange;
  timeField?: DeliveryTimeField;
  rangeAnchor?: string;
  q?: string;
  eventPage?: number;
  deliveryPage?: number;
};

/**
 * Every filter key the toolbar can write, cleared.
 *
 * Both the inline "Reset filters" button and each page's own reset use this
 * one object. Keeping the list in a single place is what stops the two resets
 * from drifting apart: the deliveries page used to clear every key except
 * `minAttempts`, so "Reset filters" silently kept filtering by attempt count.
 */
export const clearedOperationSearch: Readonly<DashboardOperationSearch> = {
  sourceId: "",
  severity: "",
  status: "",
  deliveryOutcome: "",
  destinationId: "",
  destinationMatch: "",
  destinationKind: "",
  routeId: "",
  receipt: "",
  deliveryState: "",
  minAttempts: 0,
  range: "",
  timeField: "",
  rangeAnchor: "",
  q: "",
};

/**
 * Whether the operator narrowed the list. An empty result means something
 * different when filters are on ("nothing matched") than when they are off
 * ("nothing has happened yet"), and the two empty states must say so.
 */
export function hasOperationFilters(search: DashboardOperationSearch): boolean {
  return Boolean(
    search.sourceId ||
    search.severity ||
    search.status ||
    search.deliveryOutcome ||
    search.destinationId ||
    search.destinationKind ||
    search.routeId ||
    search.receipt ||
    search.deliveryState ||
    search.minAttempts ||
    search.range ||
    // `created` is the default basis, so only "last activity" narrows the list.
    // Counting the default made a hand-edited `timeField=created` claim the
    // list was filtered when every row was still eligible.
    search.timeField === "updated" ||
    search.q?.trim(),
  );
}

export function operationFiltersFromSearch(search: DashboardOperationSearch): OperationFilterData {
  const { q, ...rest } = pruneSearch(search);
  // The URL keeps the operator's in-progress spacing so typing "Disk usage"
  // does not lose the space; only the server filter sees a trimmed query.
  const trimmed = q?.trim();

  return (trimmed ? { ...rest, q: trimmed } : rest) as OperationFilterData;
}

export function pruneSearch(search: DashboardOperationSearch): DashboardOperationSearch {
  return pickBy(
    {
      ...search,
      // The contract rejects longer input, and a hand-edited URL bypasses the
      // input's maxLength, so clip here before the value is persisted or sent.
      // Spacing is preserved: the search input is backed by this value, and
      // trimming on every keystroke used to eat the space in "Disk usage".
      q: search.q?.slice(0, OPERATION_SEARCH_MAX_LENGTH),
      // A match only means something next to the destination it describes, and
      // `delivered` is the server default. Keeping either would make the URL
      // claim a filter that changes nothing.
      destinationMatch:
        search.destinationId && search.destinationMatch === "missing"
          ? search.destinationMatch
          : undefined,
      // An anchor only means something together with the window it was captured
      // for; keeping it after the window is cleared would attach a stale instant
      // to the next window the operator picks.
      rangeAnchor: search.range ? search.rangeAnchor : undefined,
      // 0 is the schema's "any" sentinel, so it stays out of the URL the same
      // way an empty string filter does.
      minAttempts: search.minAttempts && search.minAttempts > 0 ? search.minAttempts : undefined,
      // `created` is the default and the UI writes it as an empty value, so a
      // hand-edited `timeField=created` is pruned instead of lingering in the
      // URL as a phantom filter.
      timeField: search.timeField === "updated" ? "updated" : undefined,
      // Both page counters follow the same rule: page 1 is the default, so it
      // stays out of the URL rather than making every link carry `=1`.
      eventPage: search.eventPage && search.eventPage > 1 ? search.eventPage : undefined,
      deliveryPage:
        search.deliveryPage && search.deliveryPage > 1 ? search.deliveryPage : undefined,
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
    "deliveryOutcome",
    "destinationId",
    "destinationMatch",
    "destinationKind",
    "routeId",
    "receipt",
    "deliveryState",
    "minAttempts",
    "range",
    "timeField",
    "rangeAnchor",
    "q",
  ];
  const filterChanged = filterKeys.some((key) => Object.hasOwn(next, key));
  // A new window without a new anchor would inherit the old instant. Anchors
  // are only valid for the window they were captured with, so an explicit
  // window change drops the stale one.
  const anchorStale = Object.hasOwn(next, "range") && !Object.hasOwn(next, "rangeAnchor");

  return pruneSearch({
    ...search,
    ...next,
    ...(anchorStale ? { rangeAnchor: "" } : {}),
    // A filter change starts a fresh result set, so both lists go back to their
    // first page — otherwise the reader lands mid-way through a different set.
    ...(filterChanged ? { eventPage: 1, deliveryPage: 1 } : {}),
  });
}
