import type { EventDetailDelivery } from "@tocsin/core";

import { deliveryFromRow } from "#/infra/sqlite/repositories/delivery/delivery.helpers";
import type { DeliveryRow } from "#/infra/sqlite/repositories/delivery/delivery.interface";

export interface EventDetailDeliveryRow extends DeliveryRow {
  destination_name: string;
  route_name: string | null;
}

export function eventDetailDeliveryFromRow(row: EventDetailDeliveryRow): EventDetailDelivery {
  return {
    ...deliveryFromRow(row),
    destinationName: row.destination_name,
    routeName: row.route_name,
  };
}

export function encodeHistoryCursor(time: string, id: string): string {
  return `${encodeURIComponent(time)}|${encodeURIComponent(id)}`;
}

export function decodeHistoryCursor(cursor: string): { time: string; id: string | null } {
  const [time, id] = cursor.split("|", 2);

  if (!time) {
    return { time: cursor, id: null };
  }

  return {
    time: decodeURIComponent(time),
    id: id ? decodeURIComponent(id) : null,
  };
}
