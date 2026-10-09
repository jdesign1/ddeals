"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import FilterTrigger from "@/components/FilterTrigger";
import StoreLogoBadge from "@/components/StoreLogoBadge";

type WatchlistView = "all" | "by-supermarket";
type StoreOption = { id: string; label: string };

/** Combines Watchlist layout and supermarket scope into one compact control. */
export default function WatchlistViewPicker({
  view,
  onViewChange,
  selectedStoreIds,
  stores,
  onToggleStore,
}: {
  view: WatchlistView;
  onViewChange: (view: WatchlistView) => void;
  selectedStoreIds: string[];
  stores: StoreOption[];
  onToggleStore: (storeId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedStores = selectedStoreIds.filter((storeId) => storeId !== "all");
  const hasStoreFilter = selectedStores.length > 0;
  const isActive = view !== "all" || hasStoreFilter;
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const viewLabel = hasStoreFilter ? `View · ${selectedStores.length}` : "View";
  const viewAriaLabel = `Choose Watchlist view and supermarkets. Currently ${view === "by-supermarket" ? "grouped by supermarket" : "showing all items"}; ${hasStoreFilter ? `${selectedStores.length} supermarket${selectedStores.length === 1 ? "" : "s"} selected` : "all supermarkets selected"}.`;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = restoreFocusRef.current;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusInitialControl = () => {
      dialog.querySelector<HTMLElement>("button[aria-label='Close Watchlist view']")?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.requestAnimationFrame(focusInitialControl);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
      restoreFocusRef.current = null;
    };
  }, [isOpen]);

  const openSheet = () => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsOpen(true);
  };

  const reset = () => {
    onViewChange("all");
    onToggleStore("all");
  };

  return (
    <>
      <FilterTrigger
        label={viewLabel}
        active={isActive}
        onOpen={openSheet}
        onClear={reset}
        ariaLabel={viewAriaLabel}
        expanded={isOpen}
        fill
        align="left"
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
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={viewAriaLabel}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                  <h3 className="dd-type-sheet-title text-stone-900">View Watchlist</h3>
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
                      aria-label="Close Watchlist view"
                      className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <section aria-labelledby="watchlist-layout-heading" className="space-y-2">
                    <h4 id="watchlist-layout-heading" className="dd-type-meta dd-type-meta-strong text-stone-500">Layout</h4>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["all", "All items"],
                        ["by-supermarket", "By supermarket"],
                      ] as const).map(([nextView, label]) => {
                        const selected = view === nextView;
                        return (
                          <button
                            key={nextView}
                            type="button"
                            onClick={() => onViewChange(nextView)}
                            aria-pressed={selected}
                            className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control transition-colors ${
                              selected
                                ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white"
                                : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section aria-labelledby="watchlist-supermarkets-heading" className="mt-6 space-y-2">
                    <h4 id="watchlist-supermarkets-heading" className="dd-type-meta dd-type-meta-strong text-stone-500">Supermarkets</h4>
                    <p className="text-xs leading-4 text-stone-500">Counts are per supermarket; a product can appear in more than one section.</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleStore("all")}
                        aria-pressed={!hasStoreFilter}
                        className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control transition-colors ${
                          !hasStoreFilter
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
                  </section>
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
