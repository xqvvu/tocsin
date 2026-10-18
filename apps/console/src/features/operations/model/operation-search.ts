import { pickBy } from "es-toolkit/object";
import { z } from "zod";

import type { AlertSeverity, AlertStatus, DeliveryState, OperationTimeRange } from "@tocsin/core";
import {
  AlertSeveritySchema,
  AlertStatusSchema,
  DeliveryStateSchema,
  OperationTimeRangeSchema,
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
  destinationId: z.string().catch("").optional(),
  deliveryState: z
    .union([DeliveryStateSchema, z.literal("")])
    .catch("")
    .optional(),
  range: z
    .union([OperationTimeRangeSchema, z.literal("")])
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
  destinationId?: string;
  deliveryState?: DeliveryState | "";
  range?: OperationTimeRange | "";
  q?: string;
  eventPage?: number;
  deliveryPage?: number;
}

export type OperationFilterData = {
  sourceId?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  destinationId?: string;
  deliveryState?: DeliveryState;
  range?: OperationTimeRange;
  q?: string;
  eventPage?: number;
  deliveryPage?: number;
};

export function operationFiltersFromSearch(search: DashboardOperationSearch): OperationFilterData {
  return pruneSearch(search) as OperationFilterData;
}

export function pruneSearch(search: DashboardOperationSearch): DashboardOperationSearch {
  return pickBy(
    {
      ...search,
      q: search.q?.trim(),
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
    "destinationId",
    "deliveryState",
    "range",
    "q",
  ];
  const filterChanged = filterKeys.some((key) => Object.hasOwn(next, key));

  return pruneSearch({
    ...search,
    ...next,
    // A filter change starts a fresh result set, so both lists go back to their
    // first page — otherwise the reader lands mid-way through a different set.
    ...(filterChanged ? { eventPage: 1, deliveryPage: 1 } : {}),
  });
}
