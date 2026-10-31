"use client";

import { Check, ChevronLeft, LockKeyhole, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import MascotImage from "@/components/MascotImage";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { fetchCommunityProfileSummary } from "@/lib/community-notes-api";
import { getCommunityDetectiveRank } from "@/lib/community-reputation";
import {
  issueDealDetectiveChallenge,
  submitDealDetectiveQuiz,
  type DealDetectiveQuizCase,
  type DealDetectiveQuizResult,
  type DealDetectiveQuizSide,
} from "@/lib/deal-detective-quiz";

interface DealDetectiveQuizProps {
  quizCase: DealDetectiveQuizCase;
  accessToken: string | null;
  onBack: () => void;
  onViewDeals: () => void;
  onDone: () => void;
  onPlayed: () => void;
  showViewDealsButton?: boolean;
  showBackButton?: boolean;
}

const CONFETTI_PIECES = [
  { left: 3, x: -48, y: "19rem", rotation: -42, color: "#22c55e", delay: 0 },
  { left: 9, x: -22, y: "25rem", rotation: 28, color: "#f59e0b", delay: 90 },
  { left: 15, x: 34, y: "21rem", rotation: -24, color: "#6366f1", delay: 170 },
  { left: 21, x: -56, y: "28rem", rotation: 46, color: "#ef4444", delay: 45 },
  { left: 28, x: 26, y: "23rem", rotation: -55, color: "#14b8a6", delay: 220 },
  { left: 35, x: -36, y: "30rem", rotation: 36, color: "#eab308", delay: 120 },
  { left: 42, x: 52, y: "20rem", rotation: -32, color: "#ec4899", delay: 190 },
  { left: 49, x: -18, y: "27rem", rotation: 54, color: "#22c55e", delay: 25 },
  { left: 56, x: 44, y: "24rem", rotation: -48, color: "#f97316", delay: 145 },
  { left: 63, x: -58, y: "31rem", rotation: 25, color: "#6366f1", delay: 260 },
  { left: 70, x: 30, y: "22rem", rotation: -36, color: "#ef4444", delay: 70 },
  { left: 77, x: -26, y: "29rem", rotation: 42, color: "#14b8a6", delay: 235 },
  { left: 84, x: 56, y: "20rem", rotation: -28, color: "#f59e0b", delay: 160 },
  { left: 91, x: -44, y: "26rem", rotation: 50, color: "#22c55e", delay: 105 },
  { left: 97, x: 24, y: "30rem", rotation: -44, color: "#ec4899", delay: 285 },
] as const;

function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {CONFETTI_PIECES.map((piece, index) => (
        <span
          key={index}
          className="deal-detective-confetti absolute top-0 h-4 w-2 rounded-sm"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}ms`,
            "--confetti-x": `${piece.x}px`,
            "--confetti-y": piece.y,
            "--confetti-rotation": `${piece.rotation}deg`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);
}

function choiceClass(selected: boolean, revealed: boolean, isCorrect: boolean, isSelected: boolean): string {
  if (!revealed) return selected ? "border-ink-900 bg-ink-50 ring-2 ring-ink-900/10" : "border-stone-200 bg-white hover:border-ink-300 hover:bg-stone-50";
  if (isCorrect) return "border-fair-500 bg-fair-50 ring-2 ring-fair-500/15";
  if (isSelected) return "border-alert-400 bg-alert-50 ring-2 ring-alert-400/15";
  return "border-stone-200 bg-stone-50 opacity-70";
}

export default function DealDetectiveQuiz({ quizCase, accessToken, onBack, onViewDeals, onDone, onPlayed, showViewDealsButton = true, showBackButton = true }: DealDetectiveQuizProps) {
  const [selectedSide, setSelectedSide] = useState<DealDetectiveQuizSide | null>(null);
  const [scoreResult, setScoreResult] = useState<DealDetectiveQuizResult | null>(null);
  const [currentRank, setCurrentRank] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const questionKind = quizCase.questionKind ?? "real";
  const correctSide: DealDetectiveQuizSide = quizCase.left.kind === questionKind ? "left" : "right";
  const answered = selectedSide !== null;
  const correct = selectedSide === correctSide;
  const rankLabel = scoreResult?.detective_rank ?? currentRank;

  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setCurrentRank(null);
      return;
    }
    const controller = new AbortController();
    fetchCommunityProfileSummary(accessToken, controller.signal)
      .then((summary) => {
        setCurrentRank(getCommunityDetectiveRank(summary.tips_shared, summary.helpful_received, summary.deal_detective_quiz_correct).label);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [accessToken]);

  const saveAnswer = (side: DealDetectiveQuizSide) => {
    if (!accessToken || isSubmitting) return;
    setIsSubmitting(true);
    setSaveError(null);
    void issueDealDetectiveChallenge(quizCase)
      .then(({ challenge_token }) => submitDealDetectiveQuiz(quizCase, side, accessToken, challenge_token))
      .then(setScoreResult)
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : "We couldn't save your score right now.");
      })
      .finally(() => setIsSubmitting(false));
  };

  const chooseSide = (side: DealDetectiveQuizSide) => {
    if (answered || isSubmitting) return;
    setSelectedSide(side);
    onPlayed();
    saveAnswer(side);
  };

  const renderChoice = (side: DealDetectiveQuizSide) => {
    const candidate = side === "left" ? quizCase.left : quizCase.right;
    const isSelected = selectedSide === side;
    const isCorrect = correctSide === side;
    const verdictLabel = candidate.kind === "real" ? "Real Saver" : "Dodgy Deal";
    const verdictBadgeClass = candidate.kind === "dodgy" || (isSelected && !isCorrect)
      ? "bg-alert-100 text-alert-900"
      : "bg-fair-100 text-fair-900";

    return (
      <button
        key={side}
        type="button"
        disabled={answered || isSubmitting}
        aria-pressed={isSelected}
        onClick={() => chooseSide(side)}
        className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border text-left transition-[border-color,background-color,opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 disabled:cursor-default ${choiceClass(isSelected, answered, isCorrect, isSelected)}`}
      >
        <div className="relative flex h-24 items-center justify-center bg-stone-50 p-2.5">
          <ProductImage src={candidate.product.image} alt="" width={96} height={96} sizes="96px" className="h-full w-full object-contain" />
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 dd-type-meta dd-type-meta-strong text-stone-700 shadow-xs">{side === "left" ? "A" : "B"}</span>
        </div>
        <div className="flex min-h-28 flex-1 flex-col p-3">
          <p className="mt-2 line-clamp-2 dd-type-control text-stone-900">{candidate.product.name}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-lg font-black tabular-nums text-stone-900">{currency(candidate.deal.price)}</p>
            <StoreLogoBadge store={candidate.deal.store} variant="compact" />
          </div>
          {answered && (
            <span className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 dd-type-meta dd-type-meta-strong ${verdictBadgeClass}`}>
              {isCorrect ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : isSelected ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {verdictLabel}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="relative flex flex-col">
      {correct && answered && <ConfettiBurst key={selectedSide} />}

      {showBackButton && (
        <div className="pointer-events-none sticky top-0 z-40 h-0">
          <button ref={backButtonRef} type="button" onClick={onBack} aria-label="Back" className="pointer-events-auto absolute left-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-stone-600 shadow-md transition-colors hover:bg-white hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}

      {rankLabel && (
        <div className="pointer-events-none sticky top-0 z-40 h-0">
          <span className={`absolute left-3 ${showBackButton ? "top-16" : "top-3"} inline-flex items-center rounded-full border border-fair-200 bg-white px-3 py-2 dd-type-meta dd-type-meta-strong text-fair-800 shadow-md`}>
            Rank: {rankLabel}
          </span>
        </div>
      )}

      <div className="relative flex aspect-[1.05/1] justify-center overflow-hidden rounded-t-3xl">
        <MascotImage
          src="/deal-detective-case-mascot.png"
          darkSrc="/deal-detective-case-mascot.png"
          alt="Dodgy Deal mascot comparing two deal case files at headquarters"
          width={1254}
          height={1254}
          sizes="(max-width: 480px) 100vw, 432px"
          unoptimized
          className="absolute inset-0 block h-full w-full max-w-none object-cover object-top"
        />
      </div>

      <div className="px-5 pb-6">
        <div className="text-center">
          <p className="dd-type-meta dd-type-meta-strong uppercase tracking-[0.1em] text-fair-800">DETECTIVE CASE #{quizCase.caseNumber ?? 1}</p>
          <h2 id="new-specials-title" className="mt-1 font-display text-xl font-extrabold text-stone-900">
            {questionKind === "real" ? "Which one is the Real Saver?" : "Which one is the Dodgy Deal?"}
          </h2>
          <p id="new-specials-description" className="mt-2 dd-type-secondary leading-5 text-stone-600">
            {questionKind === "real"
              ? "Use your deal detective instincts and guess which deal is real"
              : "Use your deal detective instincts and guess which deal is dodgy"}
          </p>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {answered ? (
            <motion.div
              key="answer-result"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className={`mt-5 flex min-h-[13.5rem] flex-col justify-center rounded-2xl border px-5 py-6 text-center ${correct ? "border-fair-200 bg-fair-50" : "border-alert-200 bg-alert-50"}`}
              role="status"
              aria-live="polite"
            >
              <p className={`dd-type-control dd-type-control-strong ${correct ? "text-fair-900" : "text-alert-900"}`}>
                {correct ? "Great call — you spotted it." : "Close call! Not quite."}
              </p>
              <p className="mt-2 dd-type-meta leading-4 text-stone-600">
                {accessToken
                  ? scoreResult
                    ? `This case has been closed. You have ${scoreResult.quiz_correct} correct ${scoreResult.quiz_correct === 1 ? "case" : "cases"} so far.`
                    : isSubmitting
                      ? "Saving your detective score…"
                      : "Your answer is being checked."
                  : <><LockKeyhole className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Sign in to save your detective score.</>}
              </p>
              {saveError && <p className="mt-2 dd-type-meta text-alert-700" role="alert">{saveError}</p>}
              {saveError && accessToken && selectedSide && (
                <button type="button" onClick={() => saveAnswer(selectedSide)} className="mt-2 dd-type-meta dd-type-meta-strong text-ink-900 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
                  Try saving again
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="answer-choices"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="mt-5 flex gap-3"
              role="group"
              aria-label="Deal Detective case choices"
            >
              {renderChoice("left")}
              {renderChoice("right")}
            </motion.div>
          )}
        </AnimatePresence>

        {answered ? (
          <button type="button" onClick={onDone} className="dd-btn dd-btn-primary mt-3 min-h-14 w-full cursor-pointer">
            Close case
          </button>
        ) : showViewDealsButton ? (
          <button type="button" onClick={onViewDeals} className="dd-btn dd-btn-primary mt-3 min-h-14 w-full cursor-pointer">
            Skip to new deals
          </button>
        ) : null}
      </div>
    </div>
  );
}
