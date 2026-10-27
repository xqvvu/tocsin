import type {
  PortableConfigDiff,
  PortableConfigEntityRef,
  PortableConfigSectionDiff,
} from "#/features/configuration/model/portable-config-diff";
import { useTranslations } from "#/i18n/use-i18n";

const maxListedNames = 4;

interface PortableConfigDiffSummaryProps {
  diff: PortableConfigDiff;
}

export function PortableConfigDiffSummary({ diff }: PortableConfigDiffSummaryProps) {
  const t = useTranslations();
  const sections = [
    {
      key: "feishuApps",
      label: t("configuration.portableConfig.previewSectionFeishuApps"),
      diff: diff.feishuApps,
    },
    {
      key: "sources",
      label: t("configuration.portableConfig.previewSectionSources"),
      diff: diff.sources,
    },
    {
      key: "destinations",
      label: t("configuration.portableConfig.previewSectionDestinations"),
      diff: diff.destinations,
    },
    {
      key: "routes",
      label: t("configuration.portableConfig.previewSectionRoutes"),
      diff: diff.routes,
    },
  ].filter((section) => hasSectionChanges(section.diff));

  if (!diff.hasChanges) {
    return (
      <div className="grid gap-1 text-xs">
        <p className="text-muted-foreground">
          {t("configuration.portableConfig.previewNoChanges")}
        </p>
        {diff.notListedCount > 0 ? (
          <p className="text-muted-foreground">
            {t("configuration.portableConfig.previewNotListedHint", {
              count: diff.notListedCount,
            })}
          </p>
        ) : null}
      </div>
    );
  }

  const lines = sections.flatMap((section) => {
    const sectionLines: string[] = [];
    const names = (entities: PortableConfigEntityRef[]) =>
      formatNames(entities, t("configuration.portableConfig.previewNameSeparator"), (count) =>
        t("configuration.portableConfig.previewMore", { count }),
      );

    if (section.diff.added.length > 0) {
      sectionLines.push(
        t("configuration.portableConfig.previewSectionAdded", {
          section: section.label,
          count: section.diff.added.length,
          names: names(section.diff.added),
        }),
      );
    }

    if (section.diff.updated.length > 0) {
      sectionLines.push(
        t("configuration.portableConfig.previewSectionUpdated", {
          section: section.label,
          count: section.diff.updated.length,
          names: names(section.diff.updated),
        }),
      );
    }

    if (section.diff.unchangedCount > 0) {
      sectionLines.push(
        t("configuration.portableConfig.previewSectionUnchanged", {
          section: section.label,
          count: section.diff.unchangedCount,
        }),
      );
    }

    if (section.diff.notListed.length > 0) {
      sectionLines.push(
        t("configuration.portableConfig.previewSectionNotListed", {
          section: section.label,
          count: section.diff.notListed.length,
        }),
      );
    }

    return sectionLines;
  });

  return (
    <div className="grid gap-1 text-xs">
      <p className="font-medium">{t("configuration.portableConfig.previewTitle")}</p>
      {diff.settingsChanged ? (
        <p className="text-muted-foreground">
          {t("configuration.portableConfig.previewSettingsChanged")}
        </p>
      ) : null}
      <ul className="grid gap-1">
        {lines.map((line) => (
          <li key={line} className="text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function hasSectionChanges(diff: PortableConfigSectionDiff): boolean {
  return diff.added.length > 0 || diff.updated.length > 0 || diff.notListed.length > 0;
}

function formatNames(
  entities: PortableConfigEntityRef[],
  separator: string,
  formatRemaining: (count: number) => string,
): string {
  const names = entities.slice(0, maxListedNames).map((entity) => entity.name);
  const remaining = entities.length - names.length;

  if (remaining <= 0) {
    return names.join(separator);
  }

  return `${names.join(separator)} ${formatRemaining(remaining)}`;
}
