"use client";

import { DEAL_FILTER_OPTIONS, type DealFilter } from "@/lib/deal-filters";

/**
 * Shared iOS-style segmented control used by Check Deals and full-screen
 * search. These are mutually exclusive filters within the current screen,
 * so they follow Apple's iOS guidance for segmented controls rather than
 * behaving like the app-level bottom tab bar.
 */
export default function DealFilterTabs({
  value,
  onChange,
  buttonIdPrefix,
  allLabel,
  backgroundClassName = "bg-white ring-1 ring-stone-200",
}: {
  value: DealFilter;
  onChange: (value: DealFilter) => void;
  buttonIdPrefix?: string;
  allLabel?: string;
  backgroundClassName?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Deal filters"
      className={`dd-segmented-control relative flex h-11 items-center gap-0.5 rounded-full shadow-sm shadow-black/5 ${backgroundClassName}`}
    >
      {DEAL_FILTER_OPTIONS.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            id={buttonIdPrefix ? `${buttonIdPrefix}-${tab.id}` : undefined}
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative z-0 flex h-11 flex-1 cursor-pointer appearance-none items-center justify-center rounded-full px-3 py-1 text-center dd-type-control transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1 ${
              isActive ? "dd-segmented-control-active bg-ink-900 text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {tab.id === "all" ? allLabel ?? tab.label : tab.label}
          </button>
        );
      })}
    </div>
  );
}
