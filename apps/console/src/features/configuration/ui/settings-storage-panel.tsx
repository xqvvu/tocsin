import { useSuspenseQuery } from "@tanstack/react-query";

import { storageHealthQueryOptions } from "#/features/configuration/api/configuration.queries";
import { formatBytes } from "#/features/configuration/model/format-bytes";
import { useOperationDateFormatter } from "#/features/operations/model/operation-format";
import { useLocale, useTranslations } from "#/i18n/use-i18n";

/**
 * Read-only SQLite storage facts for self-hosted operators.
 *
 * The panel answers two on-call questions the runtime panel cannot: how large
 * the database file is growing, and how much history it holds. It deliberately
 * shows no path and runs no integrity check, because both add surface or block
 * the single-process runtime without helping routine triage.
 */
export function SettingsStoragePanel() {
  const t = useTranslations();
  const locale = useLocale();
  const dateFormatter = useOperationDateFormatter();
  const { data: storage } = useSuspenseQuery(storageHealthQueryOptions());
  const count = new Intl.NumberFormat(locale);

  return (
    <section
      aria-labelledby="settings-storage-title"
      className="border-border flex min-w-0 flex-col border"
    >
      <header className="border-border flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-3 py-2">
        <h2 id="settings-storage-title" className="text-sm font-medium">
          {t("configuration.storage.title")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("configuration.storage.description")}</p>
      </header>
      <dl className="bg-border grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-4">
        <StorageFact
          label={t("configuration.storage.databaseBytes")}
          value={formatBytes(storage.databaseBytes)}
        />
        <StorageFact
          label={t("configuration.storage.freeBytes")}
          value={formatBytes(storage.freeBytes)}
        />
        <StorageFact
          label={t("configuration.storage.events")}
          value={count.format(storage.tableCounts.events)}
        />
        <StorageFact
          label={t("configuration.storage.deliveries")}
          value={count.format(storage.tableCounts.deliveries)}
        />
        <StorageFact
          label={t("configuration.storage.deliveryAttempts")}
          value={count.format(storage.tableCounts.deliveryAttempts)}
        />
        <StorageFact
          label={t("configuration.storage.oncallPings")}
          value={count.format(storage.tableCounts.oncallPings)}
        />
        <StorageFact
          label={t("configuration.storage.oldestEvent")}
          value={
            storage.oldestEventAt
              ? dateFormatter.formatDateTime(storage.oldestEventAt)
              : t("configuration.storage.noEvents")
          }
        />
        <StorageFact
          label={t("configuration.storage.newestEvent")}
          value={
            storage.newestEventAt
              ? dateFormatter.formatDateTime(storage.newestEventAt)
              : t("configuration.storage.noEvents")
          }
        />
      </dl>
    </section>
  );
}

function StorageFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card min-w-0 px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-xs tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}
