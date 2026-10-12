import { z } from "zod";

import type { DeliveryJob, DeliveryState, ProviderReference } from "#core/delivery/delivery";
import type { DestinationKind, DestinationSummary } from "#core/destination/destination";
import type { EventRecord } from "#core/event/event";
import type { NormalizedEvent } from "#core/event/normalized-event";
import type { JsonObject, JsonValue } from "#core/json";
import type { OncallPing } from "#core/oncall/oncall";
import type {
  RouteDefinition,
  RouteMatchGap,
  RouteMatchProvenance,
  RouteMatchResult,
} from "#core/route/route";
import type { SourceSummary } from "#core/source/source";

export type IsoDateTimeString = string;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NumberedPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Operations {
  events: NumberedPage<EventListItem>;
  deliveries: Page<DeliveryListItem>;
}

export interface EventListItem {
  id: string;
  sourceId: string;
  sourceName: string;
  severity: NormalizedEvent["severity"];
  status: NormalizedEvent["status"];
  title: string;
  fingerprint: string;
  receivedAt: IsoDateTimeString;
  routeMatchCount: number;
  deliveryCounts: Record<DeliveryState, number>;
}

export interface EventDetail {
  event: EventRecord;
  source: SourceSummary;
  routeMatches: RouteMatchResult[];
  /**
   * Whether `routeMatches` is the snapshot recorded at intake time or the result
   * of evaluating the *current* route definitions on read. Without it the two are
   * indistinguishable in the UI — see `docs/research/route-authoring-current-state.md` §4.2.
   */
  routeMatchesProvenance: RouteMatchProvenance;
  /**
   * Pairs the snapshot matched but which produced no delivery, with the reason
   * recoverable from records — or `unknown` when the records are gone. Empty is
   * the normal case.
   */
  routeMatchGaps: RouteMatchGap[];
  deliveries: EventDetailDelivery[];
}

export interface EventDetailDelivery extends DeliveryJob {
  destinationName: string;
  routeName: string | null;
}

export interface DeliveryListItem {
  id: string;
  eventId: string;
  sourceName: string;
  destinationName: string;
  /**
   * Discriminates the destination's icon. Optional so a persisted snapshot
   * written before this field existed still parses; the UI falls back to a
   * generic glyph rather than rendering nothing.
   */
  destinationKind?: DestinationKind;
  routeName: string | null;
  state: DeliveryState;
  attemptCount: number;
  nextAttemptAt: IsoDateTimeString | null;
  lastError: string | null;
  updatedAt: IsoDateTimeString;
}

export interface DeliveryAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  state: "running" | "succeeded" | "failed";
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  startedAt: IsoDateTimeString;
  finishedAt: IsoDateTimeString | null;
}

export interface DeliveryDetail {
  job: DeliveryJob;
  event: EventRecord;
  source: SourceSummary;
  destination: DestinationSummary;
  destinationMetadata: JsonObject;
  route: RouteDefinition | null;
  renderedPayload: JsonValue | null;
  providerReference: ProviderReference | null;
  attempts: DeliveryAttempt[];
  /** Urgent phone pages created for this delivery, oldest first. */
  pings: OncallPing[];
}

export interface WorkerRunNotice {
  claimed: number;
  reclaimed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  startedAt: IsoDateTimeString;
  finishedAt: IsoDateTimeString;
  health?: WorkerHealthSnapshot;
  runnerHealth?: WorkerHealthSnapshot;
}

export interface WorkerHealthSnapshot {
  state: "idle" | "running" | "failed";
  lastStartedAt: IsoDateTimeString | null;
  lastFinishedAt: IsoDateTimeString | null;
  lastError: string | null;
  lastRun: Omit<WorkerRunNotice, "health" | "runnerHealth"> | null;
}

export const ReplayEventCommandSchema = z.object({
  eventId: z.string().min(1),
});
export type ReplayEventCommand = z.infer<typeof ReplayEventCommandSchema>;

export const PreviewRouteReplayCommandSchema = z.object({
  routeId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PreviewRouteReplayCommand = z.infer<typeof PreviewRouteReplayCommandSchema>;

export const ReplayRouteEventsCommandSchema = z.object({
  routeId: z.string().min(1),
  eventIds: z.array(z.string().min(1)).min(1).max(100),
});
export type ReplayRouteEventsCommand = z.infer<typeof ReplayRouteEventsCommandSchema>;

/** Result of manually paging one delivery: the records created by the attempt. */
export interface DeliveryPingsResult {
  deliveryId: string;
  pings: OncallPing[];
}

export interface EventReplayTarget {
  routeId: string;
  routeName: string;
  destinationId: string;
  deliveryId: string | null;
  alreadyExists: boolean;
}

export interface EventReplayPreview {
  eventId: string;
  routeMatches: RouteMatchResult[];
  targets: EventReplayTarget[];
  matchedRouteCount: number;
  newDeliveryCount: number;
  existingDeliveryCount: number;
}

export interface EventReplayResult extends EventReplayPreview {
  createdDeliveryIds: string[];
  skippedExistingCount: number;
}

export interface RouteReplayEventSummary {
  id: string;
  sourceId: string;
  sourceName: string;
  severity: NormalizedEvent["severity"];
  status: NormalizedEvent["status"];
  title: string;
  fingerprint: string;
  receivedAt: IsoDateTimeString;
}

export interface RouteReplayCandidate {
  event: RouteReplayEventSummary;
  targets: EventReplayTarget[];
  newDeliveryCount: number;
  existingDeliveryCount: number;
}

export interface RouteReplayPreview {
  routeId: string;
  routeName: string;
  enabled: boolean;
  limit: number;
  scannedEventCount: number;
  matchedEventCount: number;
  candidates: RouteReplayCandidate[];
  newDeliveryCount: number;
  existingDeliveryCount: number;
}

export interface RouteReplayResult {
  routeId: string;
  routeName: string;
  enabled: boolean;
  eventCount: number;
  createdDeliveryIds: string[];
  skippedExistingCount: number;
}
