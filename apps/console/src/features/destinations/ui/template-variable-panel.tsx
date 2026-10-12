import * as React from "react";

import { TemplateVariablePaths, TemplateVariablePrefixes } from "@tocsin/destinations";

import { Button } from "#/components/ui/button";
import { Field as UiField, FieldDescription, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Variables pinned above the groups. These cover the large majority of on-call
 * notifications, so they should not be buried among the label keys.
 */
export const commonTemplateVariablePaths: readonly string[] = [
  "event.title",
  "event.severity",
  "event.message",
  "event.statusDisplay",
  "source.name",
  "tocsin.eventUrl",
];

/** Fixed group order, so the panel does not reshuffle between releases. */
export const templateVariableGroupIds = [
  "event",
  "source",
  "destination",
  "tocsin",
  "presentation",
] as const;

export type TemplateVariableGroupId = (typeof templateVariableGroupIds)[number];

const labelPathPrefix = "presentation.labels.";

export type TemplateVariableGroup = {
  id: TemplateVariableGroupId;
  paths: string[];
  /** Label keys folded behind a single entry rather than 24 sibling buttons. */
  labelKeys: string[];
};

export type TemplateVariableLayout = {
  common: string[];
  groups: TemplateVariableGroup[];
  patterns: string[];
};

/**
 * Turn the engine's flat variable list into the panel's information architecture.
 *
 * The engine is the only source of truth for what works; this function only
 * decides how it is grouped. Two invariants the panel test pins:
 * - every path appears exactly once (a path pinned as common is removed from
 *   its group, so `event.title` is not rendered twice);
 * - no group is rendered empty (pinning `tocsin.eventUrl` hides the `tocsin`
 *   group rather than leaving a header with nothing under it).
 */
export function layoutTemplateVariables(
  paths: readonly string[] = TemplateVariablePaths,
  prefixes: readonly string[] = TemplateVariablePrefixes,
): TemplateVariableLayout {
  const common = commonTemplateVariablePaths.filter((path) => paths.includes(path));
  const remaining = paths.filter((path) => !common.includes(path));

  const groups = templateVariableGroupIds
    .map((id) => {
      const inGroup = remaining.filter((path) => path.startsWith(`${id}.`));

      return {
        id,
        paths: inGroup.filter((path) => !path.startsWith(labelPathPrefix)),
        labelKeys:
          id === "presentation"
            ? inGroup
                .filter((path) => path.startsWith(labelPathPrefix))
                .map((path) => path.slice(labelPathPrefix.length))
            : [],
      };
    })
    .filter((group) => group.paths.length > 0 || group.labelKeys.length > 0);

  return {
    common,
    groups,
    patterns: prefixes.map(templateVariablePattern),
  };
}

/**
 * Render a dynamic prefix as the syntax it actually accepts.
 *
 * These are hints, not insertable values: `payload.<name>` is not a legal path
 * (the `payload` segment takes `.key`, `[0]` or `["key"]` only), so offering it
 * as a button produced a diagnostic on click.
 */
export function templateVariablePattern(prefix: string): string {
  return prefix === "payload." ? "payload.<key>" : `${prefix}<name>`;
}

export function TemplateVariablePanel({
  paths = TemplateVariablePaths,
  prefixes = TemplateVariablePrefixes,
  onInsert,
}: {
  paths?: readonly string[];
  prefixes?: readonly string[];
  onInsert: (variable: string) => void;
}) {
  const t = useTranslations();
  const [query, setQuery] = React.useState("");
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({
    presentation: true,
  });
  const [labelsOpen, setLabelsOpen] = React.useState(false);

  const layout = React.useMemo(() => layoutTemplateVariables(paths, prefixes), [paths, prefixes]);
  const labelPaths = layout.groups.flatMap((group) =>
    group.labelKeys.map((key) => `${labelPathPrefix}${key}`),
  );
  const allPaths = [
    ...layout.common,
    ...layout.groups.flatMap((group) => group.paths),
    ...labelPaths,
  ];

  const needle = query.trim().toLowerCase();
  const matches = needle ? allPaths.filter((path) => path.toLowerCase().includes(needle)) : [];

  const renderVariable = (path: string) => (
    <Button
      key={path}
      type="button"
      variant="outline"
      size="xs"
      onClick={() => onInsert(`{{${path}}}`)}
    >
      {path}
    </Button>
  );

  return (
    <UiField>
      <FieldLabel>{t("destinations.form.variables")}</FieldLabel>
      <Input
        aria-label={t("destinations.form.variablesFilter")}
        placeholder={t("destinations.form.variablesFilter")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {needle ? (
        matches.length > 0 ? (
          <div className="flex flex-wrap gap-1">{matches.map(renderVariable)}</div>
        ) : (
          <p className="text-muted-foreground text-xs">{t("destinations.form.variablesEmpty")}</p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {layout.common.length > 0 ? (
            <VariableGroupSection
              title={t("destinations.form.variablesCommon")}
              count={layout.common.length}
              open={!collapsedGroups.common}
              onToggle={() =>
                setCollapsedGroups((previous) => ({
                  ...previous,
                  common: !previous.common,
                }))
              }
            >
              {layout.common.map(renderVariable)}
            </VariableGroupSection>
          ) : null}
          {layout.groups.map((group) => (
            <VariableGroupSection
              key={group.id}
              title={t(`destinations.form.variablesGroup.${group.id}`)}
              count={group.paths.length}
              open={!collapsedGroups[group.id]}
              onToggle={() =>
                setCollapsedGroups((previous) => ({
                  ...previous,
                  [group.id]: !previous[group.id],
                }))
              }
            >
              {group.paths.map(renderVariable)}
              {group.labelKeys.length > 0 ? (
                <VariableGroupSection
                  title={t("destinations.form.variablesGroup.labels")}
                  count={group.labelKeys.length}
                  open={labelsOpen}
                  onToggle={() => setLabelsOpen((previous) => !previous)}
                  nested
                >
                  {group.labelKeys.map((key) => renderVariable(`${labelPathPrefix}${key}`))}
                </VariableGroupSection>
              ) : null}
            </VariableGroupSection>
          ))}
          {layout.patterns.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs font-medium">
                {t("destinations.form.variablesPatterns")}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {layout.patterns.map((pattern) => (
                  <code key={pattern} className="bg-muted rounded-none px-2 py-1 text-xs">
                    {pattern}
                  </code>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {t("destinations.form.variablesPatternsDescription")}
              </p>
            </div>
          ) : null}
        </div>
      )}
      <FieldDescription>{t("destinations.form.variablesDescription")}</FieldDescription>
    </UiField>
  );
}

function VariableGroupSection({
  title,
  count,
  open,
  onToggle,
  nested = false,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  nested?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={nested ? "flex flex-col gap-1 pl-3" : "flex flex-col gap-1"}>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="w-fit"
        aria-expanded={open}
        onClick={onToggle}
      >
        {title}
        <span aria-hidden className="text-muted-foreground">
          {count}
        </span>
      </Button>
      {open ? (
        <div className={nested ? "flex flex-wrap gap-1 pl-3" : "flex flex-wrap gap-1"}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
