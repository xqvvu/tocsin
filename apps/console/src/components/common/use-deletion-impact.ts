import * as React from "react";

import type { DeletionImpact } from "@tocsin/core";

import type { DeletionImpactLoadState } from "#/components/common/deletion-impact-notice";

export type DeletionImpactLoader = (id: string) => Promise<DeletionImpact>;

/**
 * Per-dialog preview state for a delete confirmation.
 *
 * The caller supplies the loader (a feature oRPC call) so this hook stays free
 * of feature imports. `request` clears any earlier acknowledgement, and a
 * stale response from a previous open cannot overwrite the current one.
 */
export function useDeletionImpact(load: DeletionImpactLoader) {
  const [impact, setImpact] = React.useState<DeletionImpact | null>(null);
  const [state, setState] = React.useState<DeletionImpactLoadState>("idle");
  const [confirmed, setConfirmed] = React.useState(false);
  const requestId = React.useRef(0);

  const reset = React.useCallback(() => {
    requestId.current += 1;
    setImpact(null);
    setState("idle");
    setConfirmed(false);
  }, []);

  const request = React.useCallback(
    (id: string) => {
      const current = requestId.current + 1;
      requestId.current = current;
      setImpact(null);
      setConfirmed(false);
      setState("loading");

      void load(id).then(
        (result) => {
          if (requestId.current !== current) {
            return;
          }
          setImpact(result);
          setState("ready");
        },
        () => {
          if (requestId.current !== current) {
            return;
          }
          setState("error");
        },
      );
    },
    [load],
  );

  return { impact, state, confirmed, setConfirmed, request, reset };
}

/** A delete waits for the counts, and for the acknowledgement when they matter. */
export function deletionImpactBlocksConfirm(
  impact: DeletionImpact | null,
  state: DeletionImpactLoadState,
  confirmed: boolean,
): boolean {
  if (state === "loading") {
    return true;
  }

  return state === "ready" && impact !== null && deletionImpactTotal(impact) > 0 && !confirmed;
}

export function deletionImpactTotal(impact: DeletionImpact): number {
  return impact.eventCount + impact.deliveryCount + impact.attemptCount + impact.oncallPingCount;
}
