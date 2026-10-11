import { AlertSeveritySchema, AlertStatusSchema } from "@tocsin/core";
import type { AlertSeverity, AlertStatus } from "@tocsin/core";

export function normalizeSeverity(value: unknown): AlertSeverity {
  const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

  if (["critical", "crit", "p0", "p1", "high", "error", "fatal"].includes(normalized)) {
    return "critical";
  }

  if (["warning", "warn", "p2", "medium"].includes(normalized)) {
    return "warning";
  }

  if (["info", "informational", "low", "notice", "ok"].includes(normalized)) {
    return "info";
  }

  return AlertSeveritySchema.parse("unknown");
}

export function normalizeStatus(value: unknown): AlertStatus {
  const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

  if (["firing", "triggered", "alerting", "open", "active", "problem"].includes(normalized)) {
    return "firing";
  }

  if (["resolved", "recovering", "recovered", "closed", "ok", "normal"].includes(normalized)) {
    return "resolved";
  }

  return AlertStatusSchema.parse("unknown");
}
