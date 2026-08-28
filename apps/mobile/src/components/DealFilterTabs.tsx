"use client";

import { AnimatePresence, motion } from "motion/react";
import { DEAL_FILTER_OPTIONS, type DealFilter } from "@/lib/deal-filters";

/**
 * Shared deal-filter tabs used by Check Deals and full-screen search.
 * The selected value is intentionally supplied by the caller so every
 * surface can bind to the same app-level selection.
 */
export default function DealFilterTabs({
  value,
  onChange,
  buttonIdPrefix,
  backgroundClassName = "bg-white",
  inactiveBackgroundClassName = "",
}: {
  value: DealFilter;
  onChange: (value: DealFilter) => void;
  buttonIdPrefix?: string;
  backgroundClassName?: string;
  inactiveBackgroundClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-1 rounded-xl border border-stone-300 p-1 shadow-none transition-[background-color] duration-300 ease-out ${backgroundClassName}`}>
      {DEAL_FILTER_OPTIONS.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            id={buttonIdPrefix ? `${buttonIdPrefix}-${tab.id}` : undefined}
            aria-pressed={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative z-0 flex-1 cursor-pointer rounded-lg py-2 text-[13px] leading-4 font-bold transition-colors ${
              isActive ? "text-white" : `${inactiveBackgroundClassName} text-stone-600 hover:text-stone-900`
            }`}
          >
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.span
                  className="absolute inset-0 rounded-lg bg-stone-900"
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
