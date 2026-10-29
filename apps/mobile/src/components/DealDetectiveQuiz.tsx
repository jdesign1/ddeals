"use client";

import { Check, LockKeyhole, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import MascotImage from "@/components/MascotImage";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";
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

export default function DealDetectiveQuiz({ quizCase, accessToken, onBack, onViewDeals }: DealDetectiveQuizProps) {
  const [selectedSide, setSelectedSide] = useState<DealDetectiveQuizSide | null>(null);
  const [scoreResult, setScoreResult] = useState<DealDetectiveQuizResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const correctSide: DealDetectiveQuizSide = quizCase.left.kind === "real" ? "left" : "right";
  const answered = selectedSide !== null;
  const correct = selectedSide === correctSide;

  useEffect(() => {
    backButtonRef.current?.focus();
  }, []);

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
    saveAnswer(side);
  };

  const renderChoice = (side: DealDetectiveQuizSide) => {
    const candidate = side === "left" ? quizCase.left : quizCase.right;
    const isSelected = selectedSide === side;
    const isCorrect = correctSide === side;
    const verdictLabel = candidate.kind === "real" ? "Real Saver" : "Dodgy Deal";

    return (
      <button
        key={side}
        type="button"
        disabled={answered || isSubmitting}
        aria-pressed={isSelected}
        onClick={() => chooseSide(side)}
        className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border text-left transition-[border-color,background-color,opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 disabled:cursor-default ${choiceClass(isSelected, answered, isCorrect, isSelected)}`}
      >
        <div className="relative flex h-28 items-center justify-center bg-stone-50 p-3">
          <ProductImage src={candidate.product.image} alt="" width={112} height={112} sizes="112px" className="h-full w-full object-contain" />
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 dd-type-meta dd-type-meta-strong text-stone-700 shadow-xs">{side === "left" ? "A" : "B"}</span>
        </div>
        <div className="flex min-h-32 flex-1 flex-col p-3">
          <div className="flex items-center gap-1.5">
            <StoreLogoBadge store={candidate.deal.store} variant="compact" decorative />
            <span className="min-w-0 truncate dd-type-meta text-stone-500">{candidate.deal.store}</span>
          </div>
          <p className="mt-2 line-clamp-2 dd-type-control text-stone-900">{candidate.product.name}</p>
          <p className="mt-auto pt-3 text-lg font-black tabular-nums text-stone-900">{currency(candidate.deal.price)}</p>
          {answered && (
            <span className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 dd-type-meta dd-type-meta-strong ${isCorrect ? "bg-fair-100 text-fair-900" : isSelected ? "bg-alert-100 text-alert-900" : "bg-stone-200 text-stone-700"}`}>
              {isCorrect ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : isSelected ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {verdictLabel}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col">
      <button ref={backButtonRef} type="button" onClick={onBack} className="mb-2 inline-flex min-h-11 w-fit items-center gap-1.5 dd-type-control text-stone-600 underline decoration-stone-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
        <span aria-hidden="true">←</span> Back to new deals
      </button>

      <div className="flex justify-center">
        <MascotImage
          src="/deal-detective-case-mascot.png"
          darkSrc="/deal-detective-case-mascot.png"
          alt="Dodgy Deal mascot comparing two deal case files at headquarters"
          width={1254}
          height={1254}
          sizes="220px"
          unoptimized
          className="h-auto w-full max-w-[13rem]"
        />
      </div>

      <div className="text-center">
        <p className="dd-type-meta dd-type-meta-strong uppercase tracking-[0.1em] text-fair-800">Deal Detective case</p>
        <h2 id="new-specials-title" className="mt-1 font-display text-xl font-extrabold text-stone-900">Which one is the Real Saver?</h2>
        <p id="new-specials-description" className="mt-2 dd-type-secondary leading-5 text-stone-600">
          Pick the special you think has the stronger price history.
          {quizCase.category ? ` Case file: ${quizCase.category}.` : " This is a mixed case from the latest deals."}
        </p>
      </div>

      <div className="mt-5 flex gap-3" role="group" aria-label="Deal Detective case choices">
        {renderChoice("left")}
        {renderChoice("right")}
      </div>

      <div className="mt-4 min-h-16" aria-live="polite">
        {answered && (
          <div className={`rounded-2xl border px-4 py-3 ${correct ? "border-fair-200 bg-fair-50" : "border-alert-200 bg-alert-50"}`}>
            <p className={`dd-type-control dd-type-control-strong ${correct ? "text-fair-900" : "text-alert-900"}`}>
              {correct ? "Great call — you spotted it." : "Close call — the official verdict was different."}
            </p>
            <p className="mt-1 dd-type-meta leading-4 text-stone-600">
              {accessToken
                ? scoreResult
                  ? `${scoreResult.already_recorded ? "This case was already counted" : scoreResult.points_awarded > 0 ? "+1 detective point" : "No point this time"}. You have ${scoreResult.quiz_correct} correct ${scoreResult.quiz_correct === 1 ? "case" : "cases"} so far. Rank: ${scoreResult.detective_rank}.`
                  : isSubmitting
                    ? "Saving your detective score…"
                    : "Your answer is being checked."
                : <><LockKeyhole className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Sign in to save your detective score.</>}
            </p>
            {saveError && <p className="mt-1 dd-type-meta text-alert-700" role="alert">{saveError}</p>}
            {saveError && accessToken && selectedSide && (
              <button type="button" onClick={() => saveAnswer(selectedSide)} className="mt-2 dd-type-meta dd-type-meta-strong text-ink-900 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
                Try saving again
              </button>
            )}
          </div>
        )}
      </div>

      <button type="button" onClick={onViewDeals} className="dd-btn dd-btn-primary mt-3 min-h-14 w-full cursor-pointer">
        {answered ? "Inspect the new deals" : "Skip to new deals"}
      </button>
    </div>
  );
}
