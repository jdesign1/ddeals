"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DealFilter } from "@/lib/deal-filters";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import MascotImage from "@/components/MascotImage";
import type { NewSpecialsSummary } from "@/lib/new-specials";

interface NewSpecialsModalProps {
  open: boolean;
  summary: NewSpecialsSummary;
  onClose: () => void;
  onSelectFilter: (filter: DealFilter, dealKeys: string[]) => void;
}

export default function NewSpecialsModal({ open, summary, onClose, onSelectFilter }: NewSpecialsModalProps) {
  // Keep the shared viewport lock active until the exit animation finishes.
  // Otherwise the underlying page/nav becomes visible during the modal's
  // fade-and-scale exit, which reads as a flicker on iOS cold starts.
  const [isClosing, setIsClosing] = useState(false);
  const hasNewSpecials = summary.total > 0;
  const hasRatedSpecials = summary.realDeals > 0 || summary.dodgyDeals > 0;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onSelectFilterRef = useRef(onSelectFilter);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSelectFilterRef.current = onSelectFilter;
  }, [onClose, onSelectFilter]);

  const pluralLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;
  const changeSummary = [
    summary.newlyStarted > 0 ? `${pluralLabel(summary.newlyStarted, "new special")}` : "",
    summary.priceDrops > 0 ? `${pluralLabel(summary.priceDrops, "price drop")}` : "",
  ].filter(Boolean).join(" · ");

  const handleClose = useCallback(() => {
    setIsClosing(true);
    onCloseRef.current();
  }, []);

  const handleSelectFilter = useCallback((filter: DealFilter, dealKeys: string[]) => {
    setIsClosing(true);
    onSelectFilterRef.current(filter, dealKeys);
  }, []);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleClose();
    };
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleEscape);
      if (previouslyFocusedRef.current && document.contains(previouslyFocusedRef.current)) previouslyFocusedRef.current.focus();
    };
  }, [handleClose, open]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])") ?? [],
    );
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

  return (
    <BottomSheetPortal open={open || isClosing}>
      <AnimatePresence
        onExitComplete={() => {
          if (!open) setIsClosing(false);
        }}
      >
        {open && (
          <>
            <motion.div
              key="new-specials-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 mx-auto w-full max-w-[480px] bg-stone-900/50 backdrop-blur-xs"
            />
            <motion.div
              key="new-specials-modal"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", damping: 25, stiffness: 260 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-specials-title"
              aria-describedby="new-specials-description"
              ref={dialogRef}
              onKeyDown={handleDialogKeyDown}
              onClick={(event) => event.stopPropagation()}
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-4 top-1/2 mx-auto flex max-h-[calc(100dvh-1rem)] w-auto max-w-[27rem] -translate-y-1/2 flex-col overflow-y-auto rounded-3xl border border-stone-200 px-5 pb-6 pt-4 shadow-2xl"
            >
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close new specials message"
                ref={closeButtonRef}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900"
              >
                <span className="text-2xl leading-none" aria-hidden="true">×</span>
              </button>

              <div className="flex justify-center px-1">
                <MascotImage
                  src="/new-specials-mascot.webp"
                  darkSrc="/new-specials-mascot.webp"
                  alt="Dodgy Deal mascot investigating new supermarket specials"
                  width={1024}
                  height={1024}
                  sizes="(max-width: 480px) calc(100vw - 72px), 320px"
                  unoptimized
                  className="h-auto w-full max-w-[20rem]"
                />
              </div>

              <div className="text-center">
                <h2 id="new-specials-title" className="font-display text-xl font-extrabold text-stone-900">
                  {!hasNewSpecials
                    ? "All caught up"
                    : "Let's inspect them"}
                </h2>
                {!hasNewSpecials ? (
                  <p id="new-specials-description" className="mt-3 text-sm leading-6 text-stone-600">No fresh deals just yet.</p>
                ) : (
                  <p id="new-specials-description" className="mt-3 text-sm leading-6 text-stone-600">
                    {changeSummary ? `${changeSummary}.` : `${summary.total} ${summary.total === 1 ? "special" : "specials"} to check.`}
                  </p>
                )}
              </div>

              {hasNewSpecials && (
                <div className="mt-6 flex flex-col gap-3">
                  {hasRatedSpecials && (
                    <div className="flex flex-col gap-3">
                      {summary.realDeals > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSelectFilter("real", summary.realDealKeys)}
                          className="dd-btn dd-btn-outline new-specials-real-button min-h-12 w-full cursor-pointer"
                        >
                          <span>{pluralLabel(summary.realDeals, "Real Saver")}</span>
                        </button>
                      )}
                      {summary.dodgyDeals > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSelectFilter("dodgy", summary.dodgyDealKeys)}
                          className="dd-btn dd-btn-outline new-specials-dodgy-button min-h-12 w-full cursor-pointer"
                        >
                          <span>{pluralLabel(summary.dodgyDeals, "Dodgy Deal")}</span>
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSelectFilter("all", summary.allDealKeys)}
                    className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer"
                  >
                    <span>See all {pluralLabel(summary.total, "deal")}</span>
                  </button>
                </div>
              )}
              {!hasNewSpecials && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="dd-btn dd-btn-primary mt-6 min-h-14 w-full cursor-pointer"
                >
                  Back to deals
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
