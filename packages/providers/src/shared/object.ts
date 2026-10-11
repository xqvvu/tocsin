import { isJsonObject } from "@tocsin/core";
import type { JsonObject, Labels } from "@tocsin/core";

export function labelsFromObject(value: JsonObject | undefined): Labels {
  const labels: Labels = {};

  if (!value) {
    return labels;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      labels[key] = entry;
    } else if (typeof entry === "number" || typeof entry === "boolean") {
      labels[key] = String(entry);
    }
  }

  return labels;
}

export function objectValue(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

export function firstString(payload: JsonObject | undefined, keys: string[]): string | undefined {
  const value = firstValue(payload, keys);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function firstScalarString(
  payload: JsonObject | undefined,
  keys: string[],
): string | undefined {
  const value = firstValue(payload, keys);

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

export function firstValue(payload: JsonObject | undefined, keys: string[]): unknown {
  if (!payload) {
    return undefined;
  }

  for (const key of keys) {
    if (payload[key] !== undefined) {
      return payload[key];
    }
  }

  return undefined;
}

export function normalizeDate(value: unknown, fallback: string): string {
  if (typeof value === "number") {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);

    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString();
    }
  }

  if (typeof value === "string") {
    const date = new Date(value);

    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString();
    }
  }

  return new Date(fallback).toISOString();
}

export function normalizeStringDate(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const date = new Date(value);

    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString();
    }
  }

  return new Date(fallback).toISOString();
}

export function setOptionalString(
  metadata: JsonObject,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    metadata[key] = value;
  }
}

export function setOptionalLabel(labels: Labels, key: string, value: string | undefined): void {
  if (value !== undefined) {
    labels[key] = value;
  }
}
