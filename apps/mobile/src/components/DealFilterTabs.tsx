"use client";

import { AnimatePresence, motion } from "motion/react";
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
  backgroundClassName = "bg-white ring-1 ring-stone-200",
}: {
  value: DealFilter;
  onChange: (value: DealFilter) => void;
  buttonIdPrefix?: string;
  backgroundClassName?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Deal filters"
      className={`dd-segmented-control flex items-center gap-0.5 rounded-lg p-1 shadow-sm shadow-black/5 transition-[background-color] duration-300 ease-out ${backgroundClassName}`}
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
            className={`relative z-0 flex min-h-8 flex-1 cursor-pointer appearance-none items-center justify-center rounded-md px-3 py-1.5 text-center dd-type-control transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1 ${
              isActive ? "text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.span
                  className="pointer-events-none absolute inset-0 rounded-md bg-ink-900 shadow-sm"
                  style={{ zIndex: -1 }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </AnimatePresence>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
