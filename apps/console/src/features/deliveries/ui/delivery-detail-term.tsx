import type { ReactNode } from "react";

import { CopyableCodeLine } from "#/components/common/copyable-code-line";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export function DeliveryDetailTerm({
  label,
  value,
  mono = false,
  copyValue,
  copyLabel,
  hint,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  /**
   * When set, the value is rendered as a copyable code line instead of plain
   * text. Target-system handles are pasted into tickets and chat searches, so
   * a wrapped-but-uncopyable value makes operators select it by hand.
   */
  copyValue?: string;
  copyLabel?: string;
  /** Optional machine-readable metadata shown after a copyable value. */
  hint?: string;
}) {
  const t = useTranslations();

  if (copyValue !== undefined) {
    return (
      <>
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <CopyableCodeLine
                value={copyValue}
                copyValue={copyValue}
                copyLabel={copyLabel ?? t("common.actions.copied")}
                wrap
                tooltipValue={copyValue}
              />
            </div>
            {hint ? (
              <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{hint}</span>
            ) : null}
          </div>
        </dd>
      </>
    );
  }

  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 wrap-break-word font-medium",
          mono ? "font-mono text-[11px] leading-5" : null,
        )}
      >
        {value}
      </dd>
    </>
  );
}
