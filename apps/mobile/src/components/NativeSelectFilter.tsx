"use client";

import { ChevronDown } from "lucide-react";

/**
 * A styled native select. iOS presents this control with its system picker,
 * while the visible trigger retains the compact filter-row proportions.
 */
export default function NativeSelectFilter<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  fill = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
  fill?: boolean;
}) {
  return (
    <div className={`relative inline-flex h-11 ${fill ? "min-w-0 w-full" : "min-w-0"}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-label={ariaLabel}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 focus:outline-none focus:ring-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 inset-y-1 flex items-center rounded-full border border-stone-300 bg-white pl-3 pr-2.5 dd-type-control text-stone-700 shadow-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-600 peer-focus-visible:ring-offset-1"
      >
        <span>Sort</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-stone-700" aria-hidden="true" />
      </div>
    </div>
  );
}
