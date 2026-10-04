"use client";

import { ChevronDown } from "lucide-react";

/**
 * A styled native select. iOS presents this control with its system picker,
 * while the visible trigger retains the compact filter-row proportions.
 */
export default function NativeSelectFilter<T extends string>({
  value,
  defaultValue,
  onChange,
  options,
  ariaLabel,
  fill = false,
}: {
  value: T;
  defaultValue: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  fill?: boolean;
}) {
  const active = value !== defaultValue;

  return (
    <div className={`relative inline-flex h-11 ${fill ? "min-w-0 w-full" : "min-w-0"}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-label={ariaLabel}
        className={`h-11 w-full cursor-pointer appearance-none rounded-full border bg-white pl-3 pr-8 dd-type-control text-stone-700 shadow-none transition-colors focus:border-stone-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1 ${
          active ? "border-stone-950" : "border-stone-300"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-700" aria-hidden="true" />
    </div>
  );
}
