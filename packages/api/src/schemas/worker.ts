import { IsoDateTimeSchema } from "@tocsin/core";
import * as z from "zod";

/** Outcome of one delivery-worker pass. */
export const DeliveryWorkerRunResultSchema = z.object({
  claimed: z.number().int().min(0),
  reclaimed: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  retrying: z.number().int().min(0),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema,
  /** Present on delivery runs; true when outbound delivery is paused. */
  paused: z.boolean().optional(),
});

/**
 * Health snapshot shared by the worker instance and its runner.
 *
 * `DeliveryWorker.getHealth()` and `DeliveryWorkerRunner.getHealth()` return the
 * same shape, so one schema covers both fields of the worker-run output.
 */
export const DeliveryWorkerHealthSnapshotSchema = z.object({
  state: z.enum(["idle", "running", "failed"]),
  lastStartedAt: IsoDateTimeSchema.nullable(),
  lastFinishedAt: IsoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  lastRun: DeliveryWorkerRunResultSchema.nullable(),
});

/** Manual worker run plus the health of the worker and its runner. */
export const RunDeliveryWorkerOutputSchema = DeliveryWorkerRunResultSchema.extend({
  health: DeliveryWorkerHealthSnapshotSchema,
  runnerHealth: DeliveryWorkerHealthSnapshotSchema,
});
