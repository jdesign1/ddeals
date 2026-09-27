"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, X } from "lucide-react";
import { CATEGORY_SECTIONS } from "@dodgey-deals/shared";
import BottomSheetPortal from "@/components/BottomSheetPortal";

export default function CategoryPicker({
  selectedCategories,
  onChange,
  availableCategories,
  categoryCounts,
  label = "Categories",
  emptyMessage = "No deals in this category right now.",
  ariaLabel = "Filter by category",
  withoutShadow = false,
}: {
  selectedCategories: string[];
  onChange: (categories: string[]) => void;
  availableCategories: string[];
  categoryCounts: Map<string, number>;
  label?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  withoutShadow?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedLabel =
    selectedCategories.length === 0
      ? label
      : selectedCategories.length === 1
        ? selectedCategories[0]
        : `${selectedCategories.length} categories`;

  const toggleCategory = (category: string) => {
    onChange(
      selectedCategories.includes(category)
        ? selectedCategories.filter((current) => current !== category)
        : [...selectedCategories, category]
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`${ariaLabel}: ${selectedLabel}`}
        className={`inline-flex min-w-[7.5rem] cursor-pointer items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-2 dd-type-control text-stone-700 transition-colors hover:bg-stone-50 ${withoutShadow ? "" : "shadow-sm"}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
                aria-label={ariaLabel}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                  <h3 className="dd-type-sheet-title text-stone-900">Categories</h3>
                  <div className="flex items-center gap-1">
                    {selectedCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onChange([])}
                        className="cursor-pointer px-2 py-1 dd-type-control text-ink-600 hover:text-ink-800 hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      aria-label="Close categories"
                      className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="space-y-6 overflow-y-auto px-5 py-4">
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    aria-pressed={selectedCategories.length === 0}
                    className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${
                      selectedCategories.length === 0
                        ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white"
                        : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    All categories
                  </button>
                  {CATEGORY_SECTIONS.map((section) => {
                    const sectionCategories = section.categories.filter((category) => availableCategories.includes(category));
                    if (!sectionCategories.length) return null;
                    return (
                      <div key={section.title} className="space-y-2">
                        <h4 className="dd-type-meta dd-type-meta-strong text-stone-500">{section.title}</h4>
                        <div className="flex flex-wrap gap-2">
                          {sectionCategories.map((category) => {
                            const isSelected = selectedCategories.includes(category);
                            const hasResults = (categoryCounts.get(category) ?? 0) > 0;
                            return (
                              <button
                                key={category}
                                type="button"
                                disabled={!hasResults}
                                aria-pressed={isSelected}
                                title={hasResults ? undefined : emptyMessage}
                                onClick={() => toggleCategory(category)}
                                className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${
                                  !hasResults
                                    ? "dd-category-sheet-pill-disabled cursor-not-allowed bg-stone-50 text-stone-300"
                                    : isSelected
                                      ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white"
                                      : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"
                                }`}
                              >
                                {category}
                              </button>
                            );
                          })}
                        </div>
                      </div>
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
