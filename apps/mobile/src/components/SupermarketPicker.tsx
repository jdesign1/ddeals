"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";

export interface SupermarketOption {
  id: string;
  label: string;
}

/**
 * A compact entry point for the shared multi-supermarket filter. Keeping the
 * choices in a sheet avoids spending a full toolbar row on store pills while
 * preserving the selection state shared by Check Deals and full-screen search.
 */
export default function SupermarketPicker({
  options,
  selectedStores,
  onToggleStore,
}: {
  options: SupermarketOption[];
  selectedStores: string[];
  onToggleStore: (storeId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedCount = selectedStores.includes("all") ? 0 : selectedStores.length;
  const triggerLabel = selectedCount > 0 ? `Supermarket (${selectedCount})` : "Supermarket";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`${triggerLabel} filter`}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-2 dd-type-control text-stone-600 shadow-none transition-colors hover:bg-stone-50"
      >
        <span>{triggerLabel}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

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
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-label="Filter by supermarket"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[70dvh] min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                  <h3 className="dd-type-sheet-title text-stone-900">Supermarkets</h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close supermarkets"
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="overflow-y-auto py-2 pb-safe-sm">
                  {options.map((option) => {
                    const isSelected = selectedStores.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onToggleStore(option.id)}
                        aria-pressed={isSelected}
                        className={`flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left dd-type-control transition-colors ${
                          isSelected ? "text-ink-600" : "text-stone-700 hover:bg-stone-50"
                        }`}
                      >
                        <span>{option.id === "all" ? "All supermarkets" : option.label}</span>
                        {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                <div className="dd-sheet-cta-footer flex-shrink-0 border-t border-stone-100 px-5 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="dd-sheet-cta w-full cursor-pointer rounded-xl bg-stone-900 py-3 dd-type-control text-white transition-colors hover:bg-ink-600"
                  >
                    Done
                  </button>
                </div>
              </motion.section>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
    </>
  );
}
