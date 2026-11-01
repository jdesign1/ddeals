"use client";

import { AnimatePresence, motion } from "motion/react";
import { Gamepad2, X } from "lucide-react";
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
  quizCase: DealDetectiveQuizCase | null;
  detectiveStreakScope: string;
  accessToken: string | null;
  onPlayed: () => void;
  gameOnly?: boolean;
}

export default function NewSpecialsModal({ open, summary, onClose, onSelectFilter, onSelectAllNewDeals, quizCase, detectiveStreakScope, accessToken, onPlayed, gameOnly = false }: NewSpecialsModalProps) {
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

  useEffect(() => {
    onCloseRef.current = onClose;
    onSelectFilterRef.current = onSelectFilter;
    onSelectAllNewDealsRef.current = onSelectAllNewDeals;
  }, [onClose, onSelectAllNewDeals, onSelectFilter]);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (!open) {
        setShowQuiz(false);
        setDisplayedQuizCase(null);
        return;
      }
      if (!gameOnly || !quizCase) return;
      // A case is a short, self-contained session. Keep the first valid case
      // that opened this sheet, even if a catalogue refresh changes the parent
      // prop while the shopper is deciding.
      setDisplayedQuizCase((currentCase) => currentCase ?? quizCase);
      setShowQuiz(true);
    }, 0);
    return () => window.clearTimeout(syncTimer);
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
              className={`dd-bottom-sheet dd-bottom-sheet-surface mx-auto flex flex-col overflow-y-auto shadow-2xl ${showQuiz && displayedQuizCase ? "fixed inset-x-2 top-2 bottom-2 h-auto max-h-none w-auto max-w-[27rem] translate-y-0 rounded-3xl border border-stone-200" : "fixed inset-x-4 top-1/2 max-h-[calc(100dvh-1rem)] w-auto max-w-[27rem] -translate-y-1/2 rounded-3xl border border-stone-200"} ${showQuiz && displayedQuizCase ? "p-0" : "px-5 pb-6 pt-4"}`}
            >
              <div className="pointer-events-none sticky top-0 z-40 h-0">
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={gameOnly ? "Close Deal Detective case" : "Close new specials message"}
                  ref={closeButtonRef}
                  className={`pointer-events-auto absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-colors ${showQuiz && displayedQuizCase ? "bg-ink-900 text-white hover:bg-ink-800" : "bg-white text-stone-500 hover:bg-white hover:text-stone-900"}`}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {showQuiz && displayedQuizCase ? (
                <DealDetectiveQuiz
                  key={`${displayedQuizCase.caseNumber ?? "case"}-${displayedQuizCase.questionKind ?? "real"}-${displayedQuizCase.left.dealKey}-${displayedQuizCase.right.dealKey}`}
                  quizCase={displayedQuizCase}
                  accessToken={accessToken}
                  streakScope={detectiveStreakScope}
                  onBack={() => {
                    if (gameOnly) {
                      handleClose();
                      return;
                    }
                    setShowQuiz(false);
                    setDisplayedQuizCase(null);
                    window.requestAnimationFrame(() => quizTriggerRef.current?.focus());
                  }}
                  onViewDeals={() => {
                    if (gameOnly || !summary) {
                      handleClose();
                      return;
                    }
                    handleSelectAllNewDeals(summary.allDealKeys);
                  }}
                  onDone={handleClose}
                  onPlayed={onPlayed}
                  showViewDealsButton={!gameOnly}
                  showBackButton={!gameOnly}
                />
              ) : (
                <>
                  <div className="flex h-[10rem] justify-center px-1 sm:h-[13rem]">
                    <MascotImage
                      src="/new-specials-mascot.webp"
                      darkSrc="/new-specials-mascot.webp"
                      alt="Dodgy Deal mascot investigating new supermarket specials"
                      width={1024}
                      height={1024}
                      sizes="(max-width: 480px) calc(100vw - 72px), 320px"
                      unoptimized
                      className="h-full w-full max-w-[16rem] object-contain"
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
                    <div className="mt-5 flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectAllNewDeals(summary.allDealKeys)}
                        className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer"
                      >
                        <span>Review all {pluralLabel(summary.total, "new deal")}</span>
                      </button>
                      {hasRatedSpecials && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter new deals by verdict">
                          {summary.realDeals > 0 && (
                            <button
                              type="button"
                              aria-label={`See ${summary.realDeals} new Real Savers`}
                              onClick={() => handleSelectFilter("real", summary.realDealKeys)}
                              className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-xl border border-fair-300 bg-fair-50 px-3 py-2 text-left text-sm font-bold text-fair-900 transition-colors hover:bg-fair-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fair-700 focus-visible:ring-offset-2"
                            >
                              <span>Real Savers</span>
                              <span className="rounded-full bg-white/80 px-2 py-1 text-xs tabular-nums">{summary.realDeals}</span>
                            </button>
                          )}
                          {summary.dodgyDeals > 0 && (
                            <button
                              type="button"
                              aria-label={`See ${summary.dodgyDeals} new Dodgy Deals`}
                              onClick={() => handleSelectFilter("dodgy", summary.dodgyDealKeys)}
                              className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-xl border border-alert-300 bg-alert-50 px-3 py-2 text-left text-sm font-bold text-alert-900 transition-colors hover:bg-alert-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-700 focus-visible:ring-offset-2"
                            >
                              <span>Dodgy Deals</span>
                              <span className="rounded-full bg-white/80 px-2 py-1 text-xs tabular-nums">{summary.dodgyDeals}</span>
                            </button>
                          )}
                        </div>
                      )}
                      {quizCase && (
                        <button
                          type="button"
                          ref={quizTriggerRef}
                          onClick={() => {
                            setDisplayedQuizCase(quizCase);
                            setShowQuiz(true);
                          }}
                          aria-label="Play Deal Detective"
                          className="flex min-h-[4.5rem] w-full cursor-pointer items-center gap-3 rounded-2xl border border-fair-200 bg-fair-50 px-3 py-3 text-left transition-colors hover:bg-fair-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fair-700 focus-visible:ring-offset-2"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-fair-800 shadow-xs" aria-hidden="true">
                            <Gamepad2 className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block dd-type-control dd-type-control-strong text-fair-900">Deal Detective</span>
                            <span className="mt-0.5 block dd-type-meta text-stone-600">Earn points to rank up</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-fair-800 px-3 py-2 text-xs font-bold text-white">Play</span>
                        </button>
                      )}
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
