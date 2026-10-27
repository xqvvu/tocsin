import { RiCloseLine, RiSearchLine } from "@remixicon/react";

import { SuppressionKindSchema, SuppressionStateSchema } from "@tocsin/core";

import { useDebouncedSearchDraft } from "#/components/common/use-debounced-search-draft";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  clearedSuppressionSearch,
  SUPPRESSION_SEARCH_MAX_LENGTH,
  type SuppressionListSearch,
} from "#/features/suppressions/model/suppression-search";
import { useTranslations } from "#/i18n/use-i18n";

type TranslationFn = ReturnType<typeof useTranslations>;

export interface SuppressionFiltersProps {
  search: SuppressionListSearch;
  pending: boolean;
  onChange: (next: Partial<SuppressionListSearch>) => void;
}

/**
 * The rule list is filtered in the browser, but the filter still writes to the
 * URL so a shared link opens the same narrowed list.
 */
export function SuppressionFilters({ search, pending, onChange }: SuppressionFiltersProps) {
  const t = useTranslations();
  const searchDraft = useDebouncedSearchDraft(search.q ?? "", (q) => onChange({ q }));
  const chips = activeSuppressionFilterChips(search, t);

  // Clearing the query must also cancel an uncommitted draft; otherwise the
  // debounce would put the text back into the URL right after the reset.
  function handleFilterChange(next: Partial<SuppressionListSearch>): void {
    if (next.q === "") {
      searchDraft.clear();
    }

    onChange(next);
  }

  return (
    <div className="border-border bg-background flex flex-col gap-2 border p-2">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
          />
          <Input
            id="suppression-search"
            value={searchDraft.draft}
            aria-label={t("suppressions.filters.search")}
            aria-busy={pending}
            placeholder={t("suppressions.filters.searchPlaceholder")}
            className="h-8 pl-7"
            maxLength={SUPPRESSION_SEARCH_MAX_LENGTH}
            onChange={(event) => searchDraft.update(event.currentTarget.value)}
          />
        </div>

        <Select
          items={[
            { value: null, label: t("suppressions.filters.anyState") },
            ...SuppressionStateSchema.options.map((state) => ({
              value: state,
              label: t(`suppressions.state.${state}`),
            })),
          ]}
          value={search.state || null}
          disabled={pending}
          onValueChange={(value) =>
            handleFilterChange({
              state: (value ?? "") as SuppressionListSearch["state"],
            })
          }
        >
          <SelectTrigger
            aria-label={t("suppressions.filters.state")}
            className="h-8 w-full sm:w-40"
          >
            <SelectValue placeholder={t("suppressions.filters.anyState")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("suppressions.filters.anyState")}</SelectItem>
              {SuppressionStateSchema.options.map((state) => (
                <SelectItem key={state} value={state}>
                  {t(`suppressions.state.${state}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          items={[
            { value: null, label: t("suppressions.filters.anyKind") },
            ...SuppressionKindSchema.options.map((kind) => ({
              value: kind,
              label: t(`suppressions.kind.${kind}`),
            })),
          ]}
          value={search.kind || null}
          disabled={pending}
          onValueChange={(value) =>
            handleFilterChange({
              kind: (value ?? "") as SuppressionListSearch["kind"],
            })
          }
        >
          <SelectTrigger aria-label={t("suppressions.filters.kind")} className="h-8 w-full sm:w-36">
            <SelectValue placeholder={t("suppressions.filters.anyKind")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>{t("suppressions.filters.anyKind")}</SelectItem>
              {SuppressionKindSchema.options.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`suppressions.kind.${kind}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              disabled={pending}
              onClick={() => handleFilterChange(chip.clear)}
              className="border-border bg-muted/50 text-foreground hover:bg-muted inline-flex h-6 max-w-full items-center gap-1 border px-1.5 text-[11px] disabled:pointer-events-none disabled:opacity-60"
              aria-label={t("suppressions.filters.clearChip", { label: chip.label })}
              title={t("suppressions.filters.clearChip", { label: chip.label })}
            >
              <span className="text-muted-foreground shrink-0">{chip.label}</span>
              <span className="min-w-0 truncate font-medium">{chip.valueLabel}</span>
              <RiCloseLine aria-hidden className="size-3 shrink-0 opacity-70" />
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            className="h-6 px-1.5 text-[11px]"
            onClick={() => handleFilterChange(clearedSuppressionSearch)}
          >
            {t("common.actions.clearAllFilters")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface ActiveSuppressionFilterChip {
  key: "q" | "state" | "kind";
  label: string;
  valueLabel: string;
  clear: Partial<SuppressionListSearch>;
}

function activeSuppressionFilterChips(
  search: SuppressionListSearch,
  t: TranslationFn,
): ActiveSuppressionFilterChip[] {
  const chips: ActiveSuppressionFilterChip[] = [];

  if (search.q?.trim()) {
    chips.push({
      key: "q",
      label: t("suppressions.filters.search"),
      valueLabel: search.q.trim(),
      clear: { q: "" },
    });
  }

  if (search.state) {
    chips.push({
      key: "state",
      label: t("suppressions.filters.state"),
      valueLabel: t(`suppressions.state.${search.state}`),
      clear: { state: "" },
    });
  }

  if (search.kind) {
    chips.push({
      key: "kind",
      label: t("suppressions.filters.kind"),
      valueLabel: t(`suppressions.kind.${search.kind}`),
      clear: { kind: "" },
    });
  }

  return chips;
}
