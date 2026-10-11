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
    ...(filterChanged ? { eventPage: 1, deliveryCursor: "" } : {}),
  });
}
