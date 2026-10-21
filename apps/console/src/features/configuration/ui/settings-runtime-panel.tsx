import { useSuspenseQuery } from "@tanstack/react-query";

import { runtimeInformationQueryOptions } from "#/features/configuration/api/configuration.queries";
import { useTranslations } from "#/i18n/use-i18n";

export function SettingsRuntimePanel() {
  const t = useTranslations();
  const { data: runtime } = useSuspenseQuery(runtimeInformationQueryOptions());

  return (
    <section
      aria-labelledby="settings-runtime-title"
      className="border-border flex min-w-0 flex-col border"
    >
      <header className="border-border flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2">
        <h2 id="settings-runtime-title" className="text-sm font-medium">
          {t("configuration.runtime.title")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("configuration.runtime.description")}</p>
      </header>
      <dl className="bg-border grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-4">
        <RuntimeFact label={t("configuration.runtime.version")} value={runtime.version} />
        <RuntimeFact label={t("configuration.runtime.environment")} value={runtime.environment} />
        <RuntimeFact label={t("configuration.runtime.nodeVersion")} value={runtime.nodeVersion} />
        <RuntimeFact
          label={t("configuration.runtime.platform")}
          value={`${runtime.platform}/${runtime.architecture}`}
        />
        <RuntimeFact
          label={t("configuration.runtime.sqlite")}
          value={`${runtime.sqliteDriver} ${runtime.sqliteVersion}`}
        />
        <RuntimeFact
          label={t("configuration.runtime.destinationTimeout")}
          value={formatDuration(runtime.destinationTimeoutMs)}
        />
        <RuntimeFact
          label={t("configuration.runtime.maxWebhookBytes")}
          value={formatBytes(runtime.maxWebhookBytes)}
        />
        <RuntimeFact
          label={t("configuration.runtime.workerInterval")}
          value={formatDuration(runtime.workerIntervalMs)}
        />
        <RuntimeFact
          label={t("configuration.runtime.workerBatchSize")}
          value={String(runtime.workerBatchSize)}
        />
        <RuntimeFact
          label={t("configuration.runtime.workerStaleRunning")}
          value={formatDuration(runtime.workerStaleRunningMs)}
        />
        <RuntimeFact label={t("configuration.runtime.logFormat")} value={runtime.logFormat} />
        <RuntimeFact label={t("configuration.runtime.logLevel")} value={runtime.logLevel} />
      </dl>
    </section>
  );
}

function RuntimeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card min-w-0 px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-xs tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  if (milliseconds % 60_000 === 0) {
    return `${milliseconds / 60_000} min`;
  }

  if (milliseconds % 1_000 === 0) {
    return `${milliseconds / 1_000} s`;
  }

  return `${milliseconds} ms`;
}

function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);

  if (Number.isInteger(mebibytes)) {
    return `${mebibytes} MiB`;
  }

  const kibibytes = bytes / 1024;

  if (Number.isInteger(kibibytes)) {
    return `${kibibytes} KiB`;
  }

  return `${bytes} B`;
}
