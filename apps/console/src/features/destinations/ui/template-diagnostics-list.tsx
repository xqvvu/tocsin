import { RiAlertLine, RiErrorWarningLine } from "@remixicon/react";

import type { TemplateDiagnostic } from "@tocsin/core";

import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

/**
 * Readable rendering of the template engine's diagnostics, shared by the JSON
 * editor and the preview dialog so both surfaces describe a problem the same
 * way: severity, the engine's JSON path, then the engine's own message.
 *
 * The message is shown verbatim rather than translated. It is part of the
 * diagnostics contract the server integration tests pin, and it carries the
 * engine's "did you mean" suggestion; only the chrome around it — severity
 * label, path — is localized here.
 */
export function TemplateDiagnosticsList({
  diagnostics,
  className,
}: {
  diagnostics: readonly TemplateDiagnostic[];
  className?: string;
}) {
  const t = useTranslations();

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {diagnostics.map((diagnostic, index) => {
        const isError = diagnostic.severity === "error";

        return (
          <li
            key={`${diagnostic.severity}:${diagnostic.path ?? diagnostic.variable ?? index}`}
            className="flex items-start gap-2"
          >
            {isError ? (
              <RiErrorWarningLine aria-hidden className="text-destructive mt-0.5 shrink-0" />
            ) : (
              <RiAlertLine aria-hidden className="text-muted-foreground mt-0.5 shrink-0" />
            )}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={cn(
                    "text-xs font-medium",
                    isError ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {t(`destinations.diagnostics.severity.${diagnostic.severity}`)}
                </span>
                {diagnostic.path ? (
                  <code className="text-muted-foreground font-mono text-[11px] break-all">
                    {diagnostic.path}
                  </code>
                ) : null}
              </span>
              <span className="text-xs leading-5 break-words">{diagnostic.message}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
