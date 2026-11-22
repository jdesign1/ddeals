"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DealFilter } from "@/lib/deal-filters";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import DealDetectiveEntryCard from "@/components/DealDetectiveEntryCard";
import MascotImage from "@/components/MascotImage";
import type { DealDetectiveQuizCase, SupermarketShowdownCase } from "@/lib/deal-detective-quiz";
import { readDealDetectiveStreak, type DealDetectiveStreakState } from "@/lib/deal-detective-streak";
import type { NewSpecialsSummary } from "@/lib/new-specials";

const CLOSE_COMPLETION_FALLBACK_MS = 650;

function GameScreenLoading() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-5 pt-16 pb-6" role="status" aria-label="Loading game">
      <span className="dd-type-control dd-type-control-strong text-stone-600">Loading game…</span>
    </div>
  );
}

const DealDetectiveQuiz = dynamic(() => import("@/components/DealDetectiveQuiz"), {
  ssr: false,
  loading: GameScreenLoading,
});

const SupermarketShowdown = dynamic(() => import("@/components/SupermarketShowdown"), {
  ssr: false,
  loading: GameScreenLoading,
});

const DealDetectiveStreakLeaderboard = dynamic(() => import("@/components/DealDetectiveStreakLeaderboard"), {
  ssr: false,
  loading: GameScreenLoading,
});

interface NewSpecialsModalProps {
  open: boolean;
  summary: NewSpecialsSummary | null;
  onClose: () => void;
  onSelectFilter: (filter: DealFilter, dealKeys: string[]) => void;
  onSelectAllNewDeals: (dealKeys: string[]) => void;
  quizCase: DealDetectiveQuizCase | null;
  detectiveStreakScope: string;
  accessToken: string | null;
  onPlayed: (quizCase?: DealDetectiveQuizCase) => void;
  onSupermarketShowdownPlayed: (showdownCase: SupermarketShowdownCase) => void;
  canOpenDetectiveCase?: boolean;
  canOpenSupermarketShowdown?: boolean;
  showdownCase?: SupermarketShowdownCase | null;
  gameOnly?: boolean;
  dailyGamesOnly?: boolean;
}

function NewSpecialsModal({
  open,
  summary,
  onClose,
  onSelectFilter,
  onSelectAllNewDeals,
  quizCase,
  detectiveStreakScope,
  accessToken,
  onPlayed,
  onSupermarketShowdownPlayed,
  canOpenDetectiveCase = false,
  canOpenSupermarketShowdown = false,
  showdownCase = null,
  gameOnly = false,
  dailyGamesOnly = false,
}: NewSpecialsModalProps) {
  const prefersReducedMotion = useReducedMotion();
  // The portal unlocks as soon as `open` flips false. The exiting backdrop and
  // panel still cover the page visually, while the pending navigation action
  // waits for the animation to finish (or the fallback timer below).
  const [showQuiz, setShowQuiz] = useState(gameOnly);
  const [showShowdown, setShowShowdown] = useState(false);
  const [showStreakLeaderboard, setShowStreakLeaderboard] = useState(false);
  const [displayedShowdownCase, setDisplayedShowdownCase] = useState<SupermarketShowdownCase | null>(null);
  const [displayedQuizCase, setDisplayedQuizCase] = useState<DealDetectiveQuizCase | null>(quizCase);
  const [consumedQuizCaseKey, setConsumedQuizCaseKey] = useState<string | null>(null);
  const hasNewSpecials = (summary?.total ?? 0) > 0;
  const hasRatedSpecials = (summary?.realDeals ?? 0) > 0 || (summary?.dodgyDeals ?? 0) > 0;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const quizTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const pendingCloseActionRef = useRef<(() => void) | null>(null);
  const closeCompletionTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const onSelectFilterRef = useRef(onSelectFilter);
  const onSelectAllNewDealsRef = useRef(onSelectAllNewDeals);
  const quizCaseKey = quizCase
    ? `${quizCase.caseNumber ?? "case"}-${quizCase.questionKind ?? "real"}-${quizCase.left.dealKey}-${quizCase.right.dealKey}`
    : null;
  const dailyStreak = useMemo<DealDetectiveStreakState | null>(() => (
    open && dailyGamesOnly && !showQuiz && !showShowdown && !showStreakLeaderboard
      ? readDealDetectiveStreak(detectiveStreakScope)
      : null
  ), [dailyGamesOnly, detectiveStreakScope, open, showQuiz, showShowdown, showStreakLeaderboard]);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSelectFilterRef.current = onSelectFilter;
    onSelectAllNewDealsRef.current = onSelectAllNewDeals;
  }, [onClose, onSelectAllNewDeals, onSelectFilter]);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (!open) {
        setShowQuiz(false);
        setShowShowdown(false);
        setShowStreakLeaderboard(false);
        setDisplayedShowdownCase(null);
        setDisplayedQuizCase(null);
        setConsumedQuizCaseKey(null);
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

  const completeClose = useCallback(() => {
    if (closeCompletionTimerRef.current !== null) {
      window.clearTimeout(closeCompletionTimerRef.current);
      closeCompletionTimerRef.current = null;
    }
    const pendingCloseAction = pendingCloseActionRef.current;
    pendingCloseActionRef.current = null;
    pendingCloseAction?.();
  }, []);

  const beginClose = useCallback((pendingCloseAction: (() => void) | null = null) => {
    pendingCloseActionRef.current = pendingCloseAction;
    onCloseRef.current();
    if (closeCompletionTimerRef.current !== null) window.clearTimeout(closeCompletionTimerRef.current);
    closeCompletionTimerRef.current = window.setTimeout(completeClose, CLOSE_COMPLETION_FALLBACK_MS);
  }, [completeClose]);

  const handleClose = useCallback(() => {
    beginClose();
  }, [beginClose]);

  const handleSelectFilter = useCallback((filter: DealFilter, dealKeys: string[]) => {
    beginClose(() => onSelectFilterRef.current(filter, dealKeys));
  }, [beginClose]);

  const handleSelectAllNewDeals = useCallback((dealKeys: string[]) => {
    beginClose(() => onSelectAllNewDealsRef.current(dealKeys));
  }, [beginClose]);

  useEffect(() => () => {
    if (closeCompletionTimerRef.current !== null) window.clearTimeout(closeCompletionTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (closeCompletionTimerRef.current !== null) {
      window.clearTimeout(closeCompletionTimerRef.current);
      closeCompletionTimerRef.current = null;
    }
    pendingCloseActionRef.current = null;
  }, [open]);

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
      if (previouslyFocusedRef.current && document.contains(previouslyFocusedRef.current)) {
        previouslyFocusedRef.current.focus();
      } else {
        document.getElementById("global-header-menu-btn")?.focus();
      }
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
    /* The modal remains mounted through its exit animation, but the portal
       lock follows the visible/open state. Keeping the lock active during
       exit would leave the whole app inert if the callback is interrupted. */
    <BottomSheetPortal open={open}>
      <AnimatePresence
        onExitComplete={() => {
          if (!open) completeClose();
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
              className={`dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-4 top-2 bottom-2 mx-auto flex h-auto max-h-none w-auto max-w-[27rem] translate-y-0 flex-col overflow-y-auto rounded-3xl border border-stone-200 shadow-2xl ${(showQuiz && displayedQuizCase) || showShowdown || dailyGamesOnly ? "p-0" : "px-5 pb-6 pt-4"}`}
            >
              <div className="pointer-events-none sticky top-0 z-40 h-0">
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={dailyGamesOnly ? "Close today’s games" : gameOnly ? "Close Deal Detective case" : "Close new specials message"}
                  ref={closeButtonRef}
                  className={`pointer-events-auto absolute border-0 ${gameOnly || dailyGamesOnly || (showQuiz && displayedQuizCase) || showShowdown ? "right-3 top-3" : "-right-2 -top-2"} flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-white shadow-none outline-none transition-colors hover:bg-ink-800 focus:outline-none focus-visible:outline-none focus-visible:ring-0`}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {showShowdown && displayedShowdownCase ? (
                <SupermarketShowdown
                  key={`${displayedShowdownCase.leftDealKey}-${displayedShowdownCase.rightDealKey}`}
                  showdownCase={displayedShowdownCase}
                  accessToken={accessToken}
                  onDone={() => {
                    setShowShowdown(false);
                    setDisplayedShowdownCase(null);
                  }}
                  onPlayed={onSupermarketShowdownPlayed}
                />
              ) : showQuiz && displayedQuizCase ? (
                <DealDetectiveQuiz
                  key={`${displayedQuizCase.caseNumber ?? "case"}-${displayedQuizCase.questionKind ?? "real"}-${displayedQuizCase.left.dealKey}-${displayedQuizCase.right.dealKey}`}
                  quizCase={displayedQuizCase}
                  accessToken={accessToken}
                  streakScope={detectiveStreakScope}
                  onBack={() => {
                    if (dailyGamesOnly) {
                      setShowQuiz(false);
                      setDisplayedQuizCase(null);
                      return;
                    }
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
                  onDone={() => {
                    if (dailyGamesOnly) {
                      setShowQuiz(false);
                      setDisplayedQuizCase(null);
                    } else {
                      handleClose();
                    }
                  }}
                  onAnswered={() => setConsumedQuizCaseKey(quizCaseKey)}
                  onPlayed={() => onPlayed(displayedQuizCase)}
                  hideTopImage={dailyGamesOnly || gameOnly}
                  showViewDealsButton={false}
                  showBackButton={!gameOnly && !dailyGamesOnly}
                />
              ) : dailyGamesOnly ? (
                <AnimatePresence mode="wait" initial={false}>
                  {showStreakLeaderboard ? (
                    <motion.div
                      key="daily-game-streak-leaderboard"
                      initial={{ opacity: 0, x: 32 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className="flex min-h-full flex-1 flex-col"
                    >
                      <div className="flex min-h-14 items-center border-b border-stone-200 px-5 pt-3">
                        <button type="button" onClick={() => setShowStreakLeaderboard(false)} className="-ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 dd-type-control dd-type-control-strong text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600" aria-label="Back to today’s games">
                          <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
                          Back
                        </button>
                        <h2 id="new-specials-title" className="ml-2 font-display text-lg font-extrabold text-stone-900">Streak leaderboard</h2>
                      </div>
                      <div className="flex-1 overflow-y-auto px-5 py-4">
                        <p id="new-specials-description" className="mb-4 dd-type-secondary text-stone-600">Public tip contributors ranked by their best Deal Detective win streak.</p>
                        <DealDetectiveStreakLeaderboard accessToken={accessToken} />
                      </div>
                    </motion.div>
                  ) : (
                <motion.div
                  key="daily-games-menu"
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 28 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex min-h-full flex-1 flex-col px-5 pb-6 pt-14"
                >
                  <div className="-mx-5 -mt-14 mb-5 aspect-[1.1/1] overflow-hidden rounded-t-3xl bg-fair-50">
                    <MascotImage
                      src="/deal-detective-case-mascot-wide.webp"
                      darkSrc="/deal-detective-case-mascot-wide.webp"
                      alt="Dodgy Deal mascot investigating supermarket deals"
                      width={1024}
                      height={931}
                      sizes="(max-width: 480px) calc(100vw - 32px), 432px"
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="mb-5">
                    <h2 id="new-specials-title" className="mt-1 font-display text-2xl font-extrabold text-stone-900">Today’s games</h2>
                    <p id="new-specials-description" className="sr-only">Choose one of today’s deal-spotting games.</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {canOpenDetectiveCase && quizCase && (
                      <DealDetectiveEntryCard
                        onClick={() => {
                          setDisplayedQuizCase(quizCase);
                          setShowQuiz(true);
                        }}
                        title="Deal Detective"
                        description="Spot the Real or Dodgy deal."
                        buttonLabel="Play"
                        eyebrow="CASE 01"
                        variant="detective"
                      />
                    )}
                    {canOpenSupermarketShowdown && showdownCase && (
                      <DealDetectiveEntryCard
                        onClick={() => {
                          setDisplayedShowdownCase(showdownCase);
                          setShowShowdown(true);
                        }}
                        title="Supermarket Showdown"
                        description="Guess the lowest price"
                        buttonLabel="Play"
                        eyebrow="CASE 02"
                        variant="showdown"
                      />
                    )}
                  </div>
                  {!canOpenDetectiveCase && !canOpenSupermarketShowdown && (
                    <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-5 text-center" role="status">
                      <motion.span
                        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.2 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.75, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-fair-100 text-fair-800"
                        aria-hidden="true"
                      >
                        <Check className="h-7 w-7" strokeWidth={3} />
                      </motion.span>
                      <p className="dd-type-control dd-type-control-strong text-stone-900">You’re all done for today</p>
                    </div>
                  )}
                  {dailyStreak && dailyStreak.streak >= 2 && dailyStreak.lastResult === "win" && (
                    <button type="button" onClick={() => setShowStreakLeaderboard(true)} className="group mt-4 flex min-h-[4.5rem] w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left shadow-xs transition-colors hover:bg-amber-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 shadow-xs" aria-hidden="true">🔥</span>
                      <span className="min-w-0 flex-1">
                        <span className="block dd-type-control dd-type-control-strong text-amber-950">{dailyStreak.streak}-win streak!</span>
                        <span className="mt-0.5 block dd-type-meta text-amber-900/75">Personal best: {dailyStreak.bestStreak} wins · View leaderboard</span>
                      </span>
                      <ArrowRight className="h-5 w-5 shrink-0 text-amber-800 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" onClick={handleClose} className="dd-btn dd-btn-outline-muted mt-auto min-h-12 w-full cursor-pointer">Close</button>
                </motion.div>
                  )}
                </AnimatePresence>
              ) : (
                <>
                  <div className="-mx-5 -mt-4 aspect-square w-[calc(100%+2.5rem)] overflow-hidden rounded-t-3xl bg-stone-100">
                    <MascotImage
                      src="/new-specials-mascot.webp"
                      darkSrc="/new-specials-mascot.webp"
                      alt="Dodgy Deal mascot investigating new supermarket specials"
                      width={1024}
                      height={1024}
                      sizes="(max-width: 480px) calc(100vw - 16px), 480px"
                      unoptimized
                      className="h-full w-full max-w-none object-cover"
                    />
                  </div>

                  <div className="mt-5 text-center">
                    <h2 id="new-specials-title" className="font-display text-xl font-extrabold text-stone-900">
                      {!hasNewSpecials
                        ? "All caught up"
                        : `${summary?.total ?? 0} new deals to inspect`}
                    </h2>
                    {!hasNewSpecials ? (
                      <p id="new-specials-description" className="mt-3 text-sm leading-6 text-stone-600">No fresh deals just yet.</p>
                    ) : (
                      <span id="new-specials-description" className="sr-only">Choose Real Savers or Dodgy Deals to inspect.</span>
                    )}
                  </div>

                  {hasNewSpecials && summary && (
                    <div className="mt-5 flex flex-col gap-5">
                      {hasRatedSpecials && (
                        <div className="grid grid-cols-2 divide-x divide-stone-200/80 overflow-hidden rounded-2xl border border-stone-200/80 bg-fair-50 shadow-xs" role="group" aria-label="Filter new deals by verdict">
                          {summary.realDeals > 0 && (
                            <button
                              type="button"
                              aria-label={`See ${summary.realDeals} new Real Savers`}
                              onClick={() => handleSelectFilter("real", summary.realDealKeys)}
                              className="group flex min-w-0 cursor-pointer flex-col items-center gap-2 px-2 py-5 text-center transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fair-700 focus-visible:ring-inset"
                            >
                              <span className="dd-type-control dd-type-control-strong text-fair-700">Real Savers</span>
                              <span className="flex items-center gap-1 text-xl font-black leading-none tabular-nums text-fair-800">
                                {summary.realDeals}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                              </span>
                            </button>
                          )}
                          {summary.dodgyDeals > 0 && (
                            <button
                              type="button"
                              aria-label={`See ${summary.dodgyDeals} new Dodgy Deals`}
                              onClick={() => handleSelectFilter("dodgy", summary.dodgyDealKeys)}
                              className="group flex min-w-0 cursor-pointer flex-col items-center gap-2 px-2 py-5 text-center transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-700 focus-visible:ring-inset"
                            >
                              <span className="dd-type-control dd-type-control-strong text-alert-600">Dodgy Deals</span>
                              <span className="flex items-center gap-1 text-xl font-black leading-none tabular-nums text-alert-600">
                                {summary.dodgyDeals}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectAllNewDeals(summary.allDealKeys)}
                        className="dd-btn dd-btn-primary min-h-14 w-full cursor-pointer"
                      >
                        <span>See all {summary.total} new specials</span>
                      </button>
                      {quizCase && consumedQuizCaseKey !== quizCaseKey && (
                        <DealDetectiveEntryCard
                          buttonRef={quizTriggerRef}
                          onClick={() => {
                            setDisplayedQuizCase(quizCase);
                            setShowQuiz(true);
                          }}
                          className="mt-4"
                        />
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

export default memo(NewSpecialsModal);
