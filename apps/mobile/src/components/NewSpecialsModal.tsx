"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DealFilter } from "@/lib/deal-filters";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import DealDetectiveQuiz from "@/components/DealDetectiveQuiz";
import MascotImage from "@/components/MascotImage";
import type { DealDetectiveQuizCase } from "@/lib/deal-detective-quiz";
import type { NewSpecialsSummary } from "@/lib/new-specials";

interface NewSpecialsModalProps {
  open: boolean;
  summary: NewSpecialsSummary | null;
  onClose: () => void;
  onSelectFilter: (filter: DealFilter, dealKeys: string[]) => void;
  onSelectAllNewDeals: (dealKeys: string[]) => void;
  onSelectTopDeals: () => void;
  quizCase: DealDetectiveQuizCase | null;
  accessToken: string | null;
  onPlayed: () => void;
  gameOnly?: boolean;
}

export default function NewSpecialsModal({ open, summary, onClose, onSelectFilter, onSelectAllNewDeals, onSelectTopDeals, quizCase, accessToken, onPlayed, gameOnly = false }: NewSpecialsModalProps) {
  // Keep the shared viewport lock active until the exit animation finishes.
  // Otherwise the underlying page/nav becomes visible during the modal's
  // fade-and-scale exit, which reads as a flicker on iOS cold starts.
  const [isClosing, setIsClosing] = useState(false);
  const [showQuiz, setShowQuiz] = useState(gameOnly);
  const [displayedQuizCase, setDisplayedQuizCase] = useState<DealDetectiveQuizCase | null>(quizCase);
  const hasNewSpecials = (summary?.total ?? 0) > 0;
  const hasRatedSpecials = (summary?.realDeals ?? 0) > 0 || (summary?.dodgyDeals ?? 0) > 0;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const quizTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onSelectFilterRef = useRef(onSelectFilter);
  const onSelectAllNewDealsRef = useRef(onSelectAllNewDeals);
  const onSelectTopDealsRef = useRef(onSelectTopDeals);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSelectFilterRef.current = onSelectFilter;
    onSelectAllNewDealsRef.current = onSelectAllNewDeals;
    onSelectTopDealsRef.current = onSelectTopDeals;
  }, [onClose, onSelectAllNewDeals, onSelectFilter, onSelectTopDeals]);

  useEffect(() => {
    if (!quizCase) return;
    setDisplayedQuizCase(quizCase);
  }, [quizCase]);

  useEffect(() => {
    if (!open) {
      setShowQuiz(false);
      setDisplayedQuizCase(null);
      return;
    }
    if (quizCase) setDisplayedQuizCase(quizCase);
    if (gameOnly) setShowQuiz(true);
  }, [gameOnly, open, quizCase]);

  const pluralLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;

  const handleClose = useCallback(() => {
    setIsClosing(true);
    onCloseRef.current();
  }, []);

  const handleSelectFilter = useCallback((filter: DealFilter, dealKeys: string[]) => {
    setIsClosing(true);
    onSelectFilterRef.current(filter, dealKeys);
  }, []);

  const handleSelectAllNewDeals = useCallback((dealKeys: string[]) => {
    setIsClosing(true);
    onSelectAllNewDealsRef.current(dealKeys);
  }, []);

  const handleSelectTopDeals = useCallback(() => {
    setIsClosing(true);
    onSelectTopDealsRef.current();
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

              {showQuiz && displayedQuizCase ? (
                <DealDetectiveQuiz
                  quizCase={displayedQuizCase}
                  accessToken={accessToken}
                  onBack={() => {
                    if (gameOnly) {
                      handleClose();
                      return;
                    }
                    setShowQuiz(false);
                    window.requestAnimationFrame(() => quizTriggerRef.current?.focus());
                  }}
                  onViewDeals={() => {
                    if (gameOnly || !summary) {
                      handleClose();
                      return;
                    }
                    handleSelectAllNewDeals(summary.allDealKeys);
                  }}
                  onPlayed={onPlayed}
                />
              ) : (
                <>
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
                        : `${summary?.total ?? 0} new deal${summary?.total === 1 ? "" : "s"} to inspect`}
                    </h2>
                    {!hasNewSpecials ? (
                      <p id="new-specials-description" className="mt-3 text-sm leading-6 text-stone-600">No fresh deals just yet.</p>
                    ) : (
                      <>
                        <p id="new-specials-description" className="mt-3 text-sm leading-6 text-stone-600">Are they real or dodgy?</p>
                        <p className="mt-2 dd-type-meta dd-type-meta-strong text-stone-500">{summary?.realDeals ?? 0} Real Savers · {summary?.dodgyDeals ?? 0} Dodgy Deals</p>
                      </>
                    )}
                  </div>

                  {hasNewSpecials && summary && (
                    <div className="mt-6 flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectAllNewDeals(summary.allDealKeys)}
                        className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer"
                      >
                        <span>See all {pluralLabel(summary.total, "new deal")}</span>
                      </button>
                      {quizCase && (
                        <button
                          type="button"
                          ref={quizTriggerRef}
                          onClick={() => setShowQuiz(true)}
                          className="dd-btn dd-btn-outline min-h-12 w-full cursor-pointer border-fair-700 text-fair-900 hover:bg-fair-50"
                        >
                          <span>Test your Deal Detective skills</span>
                        </button>
                      )}
                      {hasRatedSpecials && (
                        <div className="flex flex-col gap-3">
                          {summary.realDeals > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSelectFilter("real", summary.realDealKeys)}
                              className="dd-btn dd-btn-outline new-specials-real-button min-h-12 w-full cursor-pointer"
                            >
                              <span>See {pluralLabel(summary.realDeals, "Real Saver")}</span>
                            </button>
                          )}
                          {summary.dodgyDeals > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSelectFilter("dodgy", summary.dodgyDealKeys)}
                              className="dd-btn dd-btn-outline new-specials-dodgy-button min-h-12 w-full cursor-pointer"
                            >
                              <span>See {pluralLabel(summary.dodgyDeals, "Dodgy Deal")}</span>
                            </button>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleSelectTopDeals}
                        className="dd-btn dd-btn-outline min-h-12 w-full cursor-pointer"
                      >
                        <span>See the Top 20</span>
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
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
