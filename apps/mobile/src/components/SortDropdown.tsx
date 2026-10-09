"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import FilterTrigger from "@/components/FilterTrigger";

export default function SortDropdown<T extends string>({
  value,
  defaultValue,
  onChange,
  options,
  fill = false,
  align = "center",
}: {
  value: T;
  defaultValue: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  fill?: boolean;
  align?: "left" | "center";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isActive = value !== defaultValue;

  return (
    <>
      <FilterTrigger
        label="Sort"
        active={isActive}
        onOpen={() => setIsOpen(true)}
        onClear={() => onChange(defaultValue)}
        ariaLabel="Sort deals"
        expanded={isOpen}
        compact
        hasPopup="listbox"
        fill={fill}
        align={align}
      />
      <BottomSheetPortal open={isOpen}>
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                  <h3 className="dd-type-sheet-title text-stone-900">Sort by</h3>
                  <button type="button" onClick={() => setIsOpen(false)} aria-label="Close" className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="py-2 pb-safe-sm">
                  {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          onChange(option.value);
                          setIsOpen(false);
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-left dd-type-control transition-colors ${isSelected ? "text-ink-600" : "text-stone-700 hover:bg-stone-50"}`}
                      >
                        <span>{option.label}</span>
                        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isSelected ? "border-ink-600 bg-ink-600 text-white" : "border-stone-300 bg-white text-transparent"}`}>
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
    </>
  );
}
