import { RiArrowDownSLine } from "@remixicon/react";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";

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
  values,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  values: string[];
  options: OperationMultiSelectOption[];
  /** Shown when nothing is selected; it is also the "any" state. */
  placeholder: string;
  disabled?: boolean;
  onChange: (values: string[]) => void;
}) {
  const selected = new Set(values);
  const selectedLabels = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);

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
            aria-label={selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
          />
        }
      >
        <span className="truncate">
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
        </span>
        <RiArrowDownSLine className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[13rem] p-1">
        <ul className="flex flex-col">
          {options.map((option) => {
            const checked = selected.has(option.value);

            return (
              <li key={option.value}>
                <label className="hover:bg-accent flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
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
