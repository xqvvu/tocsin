import { RiArrowDownSLine } from "@remixicon/react";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "#/components/ui/popover";
import { useTranslations } from "#/i18n/use-i18n";

export interface OperationMultiSelectOption {
  value: string;
  label: string;
}

/**
 * Filter control for dimensions the operator can narrow to several values.
 *
 * A checkbox list rather than a native multi-select: the toolbar is already
 * dense, and the popover lets one control show every option with its label
 * while the trigger keeps the current selection readable. Values are ordered
 * as the options are, so the URL and the trigger do not depend on click order.
 */
export function OperationMultiSelect({
  id,
  title,
  values,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  /** Dimension name: the popover heading and the trigger's accessible name. */
  title: string;
  values: string[];
  options: OperationMultiSelectOption[];
  /** Shown when nothing is selected; it is also the "any" state. */
  placeholder: string;
  disabled?: boolean;
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations();
  const selected = new Set(values);
  const selectedLabels = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);
  const selection = selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full justify-between font-normal"
            aria-label={t("operations.filters.multiSelectValue", { title, value: selection })}
          />
        }
      >
        <span className="truncate">{selection}</span>
        <RiArrowDownSLine className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[13rem] p-1">
        <PopoverHeader className="px-2 pt-1.5">
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{t("operations.filters.multiSelectHint")}</PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col">
          {options.map((option) => {
            const checked = selected.has(option.value);

            return (
              <li key={option.value}>
                <label className="hover:bg-accent flex cursor-pointer items-center gap-2 px-2 py-2 text-xs">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => {
                      // Keep the option order instead of click order: the same
                      // selection must produce the same URL on every path.
                      const nextValues = options
                        .map((item) => item.value)
                        .filter((value) => (value === option.value ? next : selected.has(value)));
                      onChange(nextValues);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
