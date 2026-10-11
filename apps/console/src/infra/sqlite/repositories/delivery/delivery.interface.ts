import type {
  DeliveryAttempt,
  DeliveryDetail,
  DeliveryJob,
  EventRecord,
  JsonValue,
  ProviderReference,
  RouteDefinition,
} from "@tocsin/core";
import type { IsoDateTimeString } from "@tocsin/core";

import type { SqliteJsonText } from "#/infra/sqlite/codecs";
import { SqliteError } from "#/infra/sqlite/errors";
import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";
import type { SourceRuntimeConfig } from "#/infra/sqlite/repositories/source/source.interface";

export type { DeliveryAttempt, DeliveryDetail } from "@tocsin/core";

export interface DeliveryRow {
  id: string;
  event_id: string;
  destination_id: string;
  route_id: string | null;
  state: DeliveryJob["state"];
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: IsoDateTimeString | null;
  last_error: string | null;
  rendered_payload_json: SqliteJsonText | null;
  provider_ref_type: string | null;
  provider_ref_value: string | null;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
  finished_at: IsoDateTimeString | null;
}

export interface DeliveryAttemptRow {
  id: string;
  delivery_id: string;
  attempt_number: number;
  state: "running" | "succeeded" | "failed";
  response_status: number | null;
  response_body: string | null;
  error: string | null;
  started_at: IsoDateTimeString;
  finished_at: IsoDateTimeString | null;
}

export interface DeliveryDedupeKeyRow {
  source_id: string;
  idempotency_key: string;
  route_id: string;
  destination_id: string;
  first_event_id: string;
  created_at: IsoDateTimeString;
}

export interface DeliveryRepository {
  enqueueForEvent(input: EnqueueDeliveriesInput): Promise<EnqueueDeliveriesResult>;
  reclaimStaleRunning(
    input: ReclaimStaleRunningDeliveriesInput,
  ): Promise<ReclaimStaleRunningDeliveriesResult>;
  claimNext(input: ClaimDeliveriesInput): Promise<ClaimedDelivery[]>;
  markSucceeded(input: MarkDeliverySucceededInput): Promise<DeliveryJob>;
  markFailed(input: MarkDeliveryFailedInput): Promise<DeliveryJob>;
  retryNow(input: RetryDeliveryInput): Promise<DeliveryJob>;
  get(id: string): Promise<DeliveryDetail | null>;
}

export interface EnqueueDeliveriesInput {
  event: EventRecord;
  matches: Array<{
    routeId: string;
    destinationIds: string[];
  }>;
  dedupeWindowStartsAt: IsoDateTimeString;
  now?: IsoDateTimeString;
  maxAttempts?: number;
  dedupeByIdempotency?: boolean;
  skipExistingForEvent?: boolean;
}

export interface EnqueueDeliveriesResult {
  created: DeliveryJob[];
  deduped: DedupedDelivery[];
  skippedExisting: ExistingDeliveryTarget[];
}

export interface DedupedDelivery {
  sourceId: string;
  idempotencyKey: string;
  routeId: string;
  destinationId: string;
  firstEventId: string;
}

export interface ExistingDeliveryTarget {
  deliveryId: string;
  eventId: string;
  routeId: string;
  destinationId: string;
  state: DeliveryJob["state"];
}

export interface ClaimDeliveriesInput {
  now?: IsoDateTimeString;
  limit: number;
}

export interface ReclaimStaleRunningDeliveriesInput {
  staleBefore: IsoDateTimeString;
  now?: IsoDateTimeString;
  error?: string;
}

export interface ReclaimStaleRunningDeliveriesResult {
  reclaimed: number;
}

export interface ClaimedDelivery {
  job: DeliveryJob;
  attempt: DeliveryAttempt;
  event: EventRecord;
  source: SourceRuntimeConfig;
  destination: DestinationRuntimeConfig;
  route: RouteDefinition | null;
}

export interface MarkDeliverySucceededInput {
  deliveryId: string;
  attemptId: string;
  renderedPayload?: JsonValue;
  providerReference?: ProviderReference;
  responseStatus?: number;
  responseBody?: string;
  finishedAt?: IsoDateTimeString;
}

export interface MarkDeliveryFailedInput {
  deliveryId: string;
  attemptId: string;
  error: string;
  retryAt: IsoDateTimeString | null;
  responseStatus?: number;
  responseBody?: string;
  finishedAt?: IsoDateTimeString;
}

export interface RetryDeliveryInput {
  deliveryId: string;
  requestedAt?: IsoDateTimeString;
}

export class InvalidDeliveryStateError extends SqliteError {
  constructor(deliveryId: string, state: DeliveryJob["state"], operation: string) {
    super(`Cannot ${operation} delivery ${deliveryId} while it is ${state}`);
  }
}
