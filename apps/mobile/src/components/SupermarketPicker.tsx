"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import FilterTrigger from "@/components/FilterTrigger";
import StoreLogoBadge from "@/components/StoreLogoBadge";

type StoreOption = { id: string; label: string };

/** Shared supermarket selector for Check Deals and full-screen search. */
export default function SupermarketPicker({
  selectedStoreIds,
  stores,
  onToggleStore,
}: {
  selectedStoreIds: string[];
  stores: StoreOption[];
  onToggleStore: (storeId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedStores = selectedStoreIds.filter((storeId) => storeId !== "all");
  const isActive = selectedStores.length > 0;
  const selectedLabel =
    selectedStores.length === 0
      ? "Supermarket"
      : selectedStores.length === 1
        ? stores.find((store) => store.id === selectedStores[0])?.label ?? selectedStores[0]
        : `${selectedStores.length} Supermarkets`;
  const reset = () => onToggleStore("all");
  const selectedLogoPreview = selectedStores.length > 0 ? (
    <span className="flex shrink-0 gap-0" aria-hidden="true">
      {selectedStores.slice(0, 3).map((storeId) => (
        <StoreLogoBadge key={storeId} store={storeId} variant="selector" decorative className="ring-1 ring-white" />
      ))}
    </span>
  ) : undefined;

  return (
    <>
      <FilterTrigger
        label={isActive ? "" : selectedLabel}
        active={isActive}
        onOpen={() => setIsOpen(true)}
        onClear={reset}
        ariaLabel={`Filter by supermarket: ${selectedLabel}`}
        expanded={isOpen}
        fill
        leading={selectedLogoPreview}
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
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-label="Filter by supermarket"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                  <h3 className="dd-type-sheet-title text-stone-900">Supermarkets</h3>
                  <div className="flex items-center gap-1">
                    {isActive && (
                      <button
                        type="button"
                        onClick={reset}
                        className="cursor-pointer px-2 py-1 dd-type-control text-ink-600 hover:text-ink-800 hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      aria-label="Close supermarkets"
                      className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={reset}
                      aria-pressed={!isActive}
                      className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control transition-colors ${
                        !isActive
                          ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white"
                          : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      All supermarkets
                    </button>
                    {stores.map((store) => {
                      const selected = selectedStores.includes(store.id);
                      return (
                        <button
                          key={store.id}
                          type="button"
                          onClick={() => onToggleStore(store.id)}
                          aria-pressed={selected}
                          className={`dd-category-sheet-pill inline-flex items-center gap-1.5 rounded-full px-3 py-2 dd-type-control transition-colors ${
                            selected
                              ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white"
                              : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          <StoreLogoBadge store={store.id} variant="compact" decorative />
                          {store.label}
                        </button>
                      );
                    })}
                  </div>
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
