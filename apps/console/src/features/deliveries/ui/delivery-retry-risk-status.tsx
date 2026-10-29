import type { DeliveryRetryPreview } from "@tocsin/core";

import { DeliveryRetrySuppressionNotice } from "#/features/deliveries/ui/delivery-retry-suppression-notice";
import { UrgentPagingNotice } from "#/features/operations/ui/urgent-paging-notice";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * The single slot that answers "what will this retry actually do?".
 *
 * Every state renders inside one live region so the answer is announced once
 * when it arrives, and so an empty slot never has to stand in for an answer.
 * The region is atomic because a matched rule swaps one line for three; with
 * `aria-atomic="false"` a reader may announce those paragraphs one by one and
 * lose the verdict that ties them together.
 * The resolved "no urgent calls" case used to render nothing at all, which made
 * it indistinguishable from a preview that was never checked — on the one
 * confirmation that precedes an irreversible phone page. The states are
 * ordered by what the operator must know first: a rule that swallows the retry
 * outranks the calls the retry could place, because the calls cannot happen.
 */
export function DeliveryRetryRiskStatus({
  isPending,
  isError,
  preview,
}: {
  isPending: boolean;
  isError: boolean;
  preview: DeliveryRetryPreview | null | undefined;
}) {
  const t = useTranslations();

  return (
    <div role="status" aria-atomic="true">
      {isPending ? (
        <MutedRiskLine text={t("deliveries.retry.confirm.previewPending")} />
      ) : isError || !preview ? (
        <MutedRiskLine text={t("deliveries.retry.confirm.previewUnavailable")} />
      ) : preview.suppression.status === "matched" ? (
        <DeliveryRetrySuppressionNotice suppression={preview.suppression} />
      ) : preview.suppression.status === "unavailable" ? (
        <MutedRiskLine text={t("deliveries.retry.confirm.suppressionUnavailable")} />
      ) : preview.urgentPaging.receiverCount === 0 ? (
        <MutedRiskLine text={t("deliveries.retry.confirm.noUrgentCalls")} />
      ) : (
        <UrgentPagingNotice impact={preview.urgentPaging} action="retry" />
      )}
    </div>
  );
}

/**
 * A cheap, muted line for states that carry no risk of their own.
 *
 * The copy stays deliberately weaker than a verdict: a placeholder must never
 * look like a call-free or rule-free answer.
 */
function MutedRiskLine({ text }: { text: string }) {
  return <p className="text-muted-foreground text-[11px] leading-5">{text}</p>;
}
