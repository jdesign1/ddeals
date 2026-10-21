"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import FilterTrigger from "@/components/FilterTrigger";

export type WatchlistDealTypeFilter = "all" | "Real Saver" | "Fair Price" | "Dodgy Deal";

const OPTIONS: ReadonlyArray<{ value: WatchlistDealTypeFilter; label: string }> = [
  { value: "all", label: "All deal types" },
  { value: "Real Saver", label: "Real Savers" },
  { value: "Fair Price", label: "Fair Deals" },
  { value: "Dodgy Deal", label: "Dodgy Deals" },
];

export default function DealTypePicker({
  value,
  onChange,
}: {
  value: WatchlistDealTypeFilter;
  onChange: (value: WatchlistDealTypeFilter) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];
  const isActive = value !== "all";

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = restoreFocusRef.current;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusInitialControl = () => {
      dialog.querySelector<HTMLElement>("button[aria-label='Close deal type filter']")?.focus();
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

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (index + 1) % OPTIONS.length;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = OPTIONS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      <FilterTrigger
        label={isActive ? selectedOption.label : "Deal"}
        active={isActive}
        onOpen={openSheet}
        onClear={() => onChange("all")}
        ariaLabel={`Filter by deal type: ${selectedOption.label}`}
        expanded={isOpen}
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
                aria-label="Filter by deal type"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                  <h3 className="dd-type-sheet-title text-stone-900">Deal type</h3>
                  <button type="button" onClick={() => setIsOpen(false)} aria-label="Close deal type filter" className="dd-bottom-sheet-close cursor-pointer text-stone-500 hover:bg-stone-100">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <section aria-labelledby="deal-type-options-heading" className="space-y-2">
                    <h4 id="deal-type-options-heading" className="dd-type-meta dd-type-meta-strong text-stone-500">Choose a deal type</h4>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Deal type options">
                      {OPTIONS.map((option, index) => {
                        const isSelected = option.value === value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={isSelected ? 0 : -1}
                            ref={(element) => {
                              optionRefs.current[index] = element;
                            }}
                            onKeyDown={(event) => handleOptionKeyDown(event, index)}
                            onClick={() => onChange(option.value)}
                            className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control transition-colors ${isSelected ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white" : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"}`}
                          >
                            {option.label}
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
