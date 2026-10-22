import { useSuspenseQuery } from "@tanstack/react-query";

import type { WorkerHealthEntry } from "@tocsin/api";

import { workerHealthQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useOperationDateFormatter } from "#/features/operations/model/operation-format";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Read-only background worker facts for self-hosted operators.
 *
 * The delivery and on-call queues share one in-process runner shape, so they
 * sit side by side: an operator can tell "the queue is idle because nothing is
 * due" from "the queue never started" or "the last pass failed". The panel only
 * observes runners that already exist; it never starts one.
 */
export function SettingsWorkerHealthPanel() {
  const t = useTranslations();
  const dateFormatter = useOperationDateFormatter();
  const { data: workers } = useSuspenseQuery(workerHealthQueryOptions());

  return (
    <section
      aria-labelledby="settings-worker-health-title"
      className="border-border flex min-w-0 flex-col border"
    >
      <header className="border-border flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2">
        <h2 id="settings-worker-health-title" className="text-sm font-medium">
          {t("configuration.workers.title")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("configuration.workers.description")}</p>
      </header>
      <div className="bg-border grid grid-cols-1 gap-px lg:grid-cols-2">
        <WorkerColumn
          title={t("configuration.workers.delivery")}
          entry={workers.delivery}
          formatDateTime={dateFormatter.formatDateTime}
        />
        <WorkerColumn
          title={t("configuration.workers.oncall")}
          entry={workers.oncall}
          formatDateTime={dateFormatter.formatDateTime}
        />
      </div>
    </section>
  );
}

function WorkerColumn({
  title,
  entry,
  formatDateTime,
}: {
  title: string;
  entry: WorkerHealthEntry;
  formatDateTime: (value: string) => string;
}) {
  const t = useTranslations();
  const state = workerStateLabel(entry, t);
  const run = entry.lastRun;

  return (
    <div className="bg-card min-w-0 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-medium">{title}</h3>
        <p
          className={
            entry.state === "failed"
              ? "text-destructive text-xs font-medium"
              : "text-muted-foreground text-xs"
          }
        >
          {state}
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        <WorkerFact
          label={t("configuration.workers.lastStarted")}
          value={
            entry.lastStartedAt
              ? formatDateTime(entry.lastStartedAt)
              : t("configuration.workers.neverFinished")
          }
        />
        <WorkerFact
          label={t("configuration.workers.lastFinished")}
          value={
            entry.lastFinishedAt
              ? formatDateTime(entry.lastFinishedAt)
              : t("configuration.workers.neverFinished")
          }
        />
        <WorkerFact
          label={t("configuration.workers.lastRun")}
          value={
            run
              ? t("configuration.workers.runSummary", {
                  claimed: run.claimed,
                  reclaimed: run.reclaimed,
                  succeeded: run.succeeded,
                  failed: run.failed,
                  retrying: run.retrying,
                })
              : t("configuration.workers.neverFinished")
          }
          wide
        />
        <WorkerFact
          label={t("configuration.workers.lastError")}
          value={entry.lastError ?? t("configuration.workers.noError")}
          tone={entry.lastError ? "danger" : "muted"}
          wide
        />
      </dl>
    </div>
  );
}

function WorkerFact({
  label,
  value,
  tone = "default",
  wide = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "danger";
  wide?: boolean;
}) {
  return (
    <div className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "text-destructive mt-0.5 font-mono text-xs break-words"
            : tone === "muted"
              ? "text-muted-foreground mt-0.5 font-mono text-xs break-words"
              : "mt-0.5 font-mono text-xs break-words"
        }
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function workerStateLabel(entry: WorkerHealthEntry, t: ReturnType<typeof useTranslations>): string {
  if (!entry.started) {
    return t("configuration.workers.notStarted");
  }

  switch (entry.state) {
    case "running":
      return t("configuration.workers.stateRunning");
    case "failed":
      return t("configuration.workers.stateFailed");
    case "idle":
      return t("configuration.workers.stateIdle");
  }
}
