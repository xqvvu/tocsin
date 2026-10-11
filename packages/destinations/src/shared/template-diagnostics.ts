/**
 * Shared flattening of a zod config failure into template diagnostics.
 *
 * Every adapter parses its config schema before rendering, and a failure has
 * to reach the console through the same shape the template engine emits —
 * otherwise the console needs a second renderer for "your config is invalid"
 * versus "your template is invalid". One implementation for all channels.
 */
import type { z } from "zod";

/**
 * Diagnostic shape the console renders for template and config errors. A type
 * alias rather than an interface: the adapters return it inside a `JsonObject`,
 * and only object type aliases get an implicit index signature.
 */
export type ZodTemplateDiagnostic = {
  severity: "error";
  /** Dot-joined zod path, or null when the issue has no path. */
  path: string | null;
  /** Template variable named by the message, or null for other failures. */
  variable: string | null;
  message: string;
};

/**
 * Flattens a zod config failure into the same diagnostic shape the template
 * engine emits, so the console renders template errors through one path.
 */
export function zodTemplateDiagnostics(error: z.ZodError): ZodTemplateDiagnostic[] {
  return error.issues.map((issue) => ({
    severity: "error",
    path: issue.path.join(".") || null,
    variable: variableFromTemplateIssue(issue.message),
    message: issue.message,
  }));
}

/**
 * Recovers the offending variable from the message
 * the template engine builds for an unknown placeholder. Config parse failures
 * carry that message verbatim, so the console can still point at the variable
 * rather than at the raw zod text.
 */
function variableFromTemplateIssue(message: string): string | null {
  const match = /^Destination template contains unknown variable: (.+)$/.exec(message);

  return match?.[1] ?? null;
}
