import type { ReactNode } from "react";

import { CopyableCodeLine } from "#/components/common/copyable-code-line";
import { useTranslations } from "#/i18n/use-i18n";
import { cn } from "#/lib/utils";

export function EventDetailTerm({
  label,
  value,
  mono = false,
  copyValue,
  copyLabel,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  /**
   * When set, the value is rendered as a copyable code line instead of plain
   * text. Long identifiers (event id, fingerprint, idempotency key) are what
   * operators paste into a log search, so showing a wrapped-but-uncopyable
   * blob made them select it by hand — and worse, select only part of it once
   * it wrapped.
   */
  copyValue?: string;
  copyLabel?: string;
}) {
  const t = useTranslations();

  if (copyValue !== undefined) {
    return (
      <>
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="min-w-0">
          <CopyableCodeLine
            value={copyValue}
            copyValue={copyValue}
            copyLabel={copyLabel ?? t("common.actions.copied")}
            wrap
            tooltipValue={copyValue}
          />
        </dd>
      </>
    );
  }

  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 font-medium",
          // `break-all`, not `overflow-wrap: break-word`. Identifiers here are
          // long and punctuated (`fastgpt:<hex>:green:<iso>`), and browsers
          // treat `:` and `-` as break opportunities — so `break-word` breaks
          // at those, leaving the leading `fastgpt:<32 hex>` run wider than the
          // column, which the surrounding `overflow-hidden` then clips. Only
          // `break-all` may break mid-run, which is what makes these values
          // readable. Matches CopyableCodeLine, which already chose break-all.
          "break-all",
          mono ? "font-mono text-[11px] leading-5" : null,
        )}
      >
        {value}
      </dd>
    </>
  );
}
