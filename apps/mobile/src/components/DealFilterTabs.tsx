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
  backgroundClassName = "bg-stone-100",
}: {
  value: DealFilter;
  onChange: (value: DealFilter) => void;
  buttonIdPrefix?: string;
  backgroundClassName?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Deal filters"
      className={`flex items-center gap-0.5 rounded-lg p-1 shadow-inner shadow-black/5 transition-[background-color] duration-300 ease-out ${backgroundClassName}`}
    >
      {DEAL_FILTER_OPTIONS.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            id={buttonIdPrefix ? `${buttonIdPrefix}-${tab.id}` : undefined}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative z-0 flex min-h-8 flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-center dd-type-control transition-[background-color,color,box-shadow] ${
              isActive ? "text-stone-900 shadow-sm ring-1 ring-black/5" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.span
                  className="pointer-events-none absolute inset-0 rounded-md bg-white"
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
