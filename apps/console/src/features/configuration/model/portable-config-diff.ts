import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { tomlDocumentToConfiguration, type Configuration } from "@tocsin/core";

export type PortableConfigFormat = "toml" | "json";

export interface PortableConfigEntityRef {
  id: string;
  name: string;
}

export interface PortableConfigSectionDiff {
  /** Entities in the import that do not exist yet. */
  added: PortableConfigEntityRef[];
  /** Entities that exist and whose stored fields differ from the import. */
  updated: PortableConfigEntityRef[];
  /** Entities that exist and are identical to the import. */
  unchangedCount: number;
  /** Entities that exist today but are absent from the import; import keeps them. */
  notListed: PortableConfigEntityRef[];
}

export interface PortableConfigDiff {
  settingsChanged: boolean;
  feishuApps: PortableConfigSectionDiff;
  sources: PortableConfigSectionDiff;
  destinations: PortableConfigSectionDiff;
  routes: PortableConfigSectionDiff;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  notListedCount: number;
  hasChanges: boolean;
}

export type PortableConfigPreview =
  | { status: "ok"; diff: PortableConfigDiff }
  | { status: "unparsable"; detail: string }
  | { status: "no-baseline" };

/**
 * Read-only preview of what an import would change. The console shows it before
 * the operator confirms, because a configuration import merges by id instead of
 * replacing the whole database: entries missing from the file stay untouched.
 */
export function previewPortableConfigChange(
  format: PortableConfigFormat,
  candidateText: string,
  baselineText: string,
): PortableConfigPreview {
  if (baselineText.trim().length === 0) {
    return { status: "no-baseline" };
  }

  let baseline: Configuration;

  try {
    baseline = parsePortableDocument(format, baselineText);
  } catch {
    // The baseline comes from our own export; if it no longer parses we simply
    // skip the preview instead of blocking the import.
    return { status: "no-baseline" };
  }

  let candidate: Configuration;

  try {
    candidate = parsePortableDocument(format, candidateText);
  } catch (error) {
    return { status: "unparsable", detail: describeParseError(error) };
  }

  return { status: "ok", diff: diffConfigurations(baseline, candidate) };
}

export function diffConfigurations(
  baseline: Configuration,
  candidate: Configuration,
): PortableConfigDiff {
  const feishuApps = diffSection(baseline.feishuApps, candidate.feishuApps);
  const sources = diffSection(baseline.sources, candidate.sources);
  const destinations = diffSection(baseline.destinations, candidate.destinations);
  const routes = diffSection(baseline.routes, candidate.routes);
  const sections = [feishuApps, sources, destinations, routes];
  const addedCount = sumBy(sections, (section) => section.added.length);
  const updatedCount = sumBy(sections, (section) => section.updated.length);
  const unchangedCount = sumBy(sections, (section) => section.unchangedCount);
  const notListedCount = sumBy(sections, (section) => section.notListed.length);
  const settingsChanged =
    baseline.settings.locale !== candidate.settings.locale ||
    baseline.settings.timeZone !== candidate.settings.timeZone ||
    baseline.settings.rawPayloadRetentionDays !== candidate.settings.rawPayloadRetentionDays;

  return {
    settingsChanged,
    feishuApps,
    sources,
    destinations,
    routes,
    addedCount,
    updatedCount,
    unchangedCount,
    notListedCount,
    hasChanges: settingsChanged || addedCount > 0 || updatedCount > 0,
  };
}

function parsePortableDocument(format: PortableConfigFormat, text: string): Configuration {
  const document = format === "toml" ? parseToml(text) : (JSON.parse(text) as unknown);

  return tomlDocumentToConfiguration(document);
}

function describeParseError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const [issue] = error.issues;
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "(root)";

    return issue ? `${path}: ${issue.message}` : "invalid configuration";
  }

  return error instanceof Error ? error.message : String(error);
}

function diffSection<T extends PortableConfigEntityRef>(
  baseline: readonly T[],
  candidate: readonly T[],
): PortableConfigSectionDiff {
  const baselineById = new Map(baseline.map((entity) => [entity.id, entity]));
  const candidateIds = new Set<string>();
  const added: PortableConfigEntityRef[] = [];
  const updated: PortableConfigEntityRef[] = [];
  let unchangedCount = 0;

  for (const entity of candidate) {
    candidateIds.add(entity.id);
    const existing = baselineById.get(entity.id);

    if (!existing) {
      added.push(toRef(entity));
      continue;
    }

    if (stableStringify(existing) === stableStringify(entity)) {
      unchangedCount += 1;
      continue;
    }

    updated.push(toRef(entity));
  }

  const notListed = baseline
    .filter((entity) => !candidateIds.has(entity.id))
    .map((entity) => toRef(entity));

  return { added, updated, unchangedCount, notListed };
}

function toRef(entity: PortableConfigEntityRef): PortableConfigEntityRef {
  return { id: entity.id, name: entity.name };
}

/** JSON.stringify with sorted object keys, so key order never reads as a change. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}
