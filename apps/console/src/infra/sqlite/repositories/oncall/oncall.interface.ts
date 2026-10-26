import type {
  EventRecord,
  OncallPing,
  OncallPingState,
  OncallPingTrigger,
  ProviderReference,
} from "@tocsin/core";
import type { IsoDateTimeString } from "@tocsin/core";

import type { DestinationRuntimeConfig } from "#/infra/sqlite/repositories/destination/destination.interface";

export interface OncallPingRow {
  id: string;
  delivery_id: string;
  destination_id: string;
  event_id: string;
  fingerprint: string;
  receiver: string;
  channel: string;
  state: OncallPingState;
  provider_ref_type: string | null;
  provider_ref_value: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: IsoDateTimeString | null;
  last_error: string | null;
  trigger: OncallPingTrigger;
  initiated_by: string | null;
  suppress_reason: string | null;
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
  fired_at: IsoDateTimeString | null;
}

export interface OncallPingDedupeKeyRow {
  fingerprint: string;
  destination_id: string;
  receiver: string;
  first_ping_id: string;
  created_at: IsoDateTimeString;
}

export interface OncallRepository {
  /** One ping per receiver; returns `null` when the dedupe window suppresses it. */
  enqueueForDelivery(input: EnqueueOncallPingInput): Promise<OncallPing | null>;
  reclaimStaleRunning(
    input: ReclaimStaleRunningPingsInput,
  ): Promise<ReclaimStaleRunningPingsResult>;
  claimNext(input: ClaimOncallPingsInput): Promise<ClaimedOncallPing[]>;
  markFired(input: MarkOncallPingFiredInput): Promise<OncallPing>;
  markFailed(input: MarkOncallPingFailedInput): Promise<OncallPing>;
  listForDelivery(deliveryId: string): Promise<OncallPing[]>;
  get(id: string): Promise<OncallPing | null>;
}

export interface EnqueueOncallPingInput {
  id?: string;
  deliveryId: string;
  destinationId: string;
  eventId: string;
  fingerprint: string;
  receiver: string;
  channel: string;
  providerReference: ProviderReference;
  trigger: OncallPingTrigger;
  initiatedBy?: string | null;
  maxAttempts?: number;
  /** Pings older than this instant no longer block the dedupe key. */
  dedupeWindowStartsAt: IsoDateTimeString;
  /**
   * Suppress the enqueue when this delivery already paged the receiver,
   * regardless of the dedupe window. Card resends must never ring the same
   * receiver twice (ADR 0009); only the automatic path opts in.
   */
  dedupeByDelivery?: boolean;
  now?: IsoDateTimeString;
}

export interface ReclaimStaleRunningPingsInput {
  staleBefore: IsoDateTimeString;
  now?: IsoDateTimeString;
  error?: string;
}

export interface ReclaimStaleRunningPingsResult {
  reclaimed: number;
}

export interface ClaimOncallPingsInput {
  now?: IsoDateTimeString;
  limit: number;
}

export interface ClaimedOncallPing {
  ping: OncallPing;
  destination: DestinationRuntimeConfig;
  event: EventRecord;
}

export interface MarkOncallPingFiredInput {
  pingId: string;
  firedAt?: IsoDateTimeString;
}

export interface MarkOncallPingFailedInput {
  pingId: string;
  error: string;
  retryAt: IsoDateTimeString | null;
  updatedAt?: IsoDateTimeString;
}
