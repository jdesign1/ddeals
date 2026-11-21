"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, LockKeyhole, X } from "lucide-react";
import type { DealDetectiveQuizResult, DealDetectiveQuizSide, SupermarketShowdownCase } from "@/lib/deal-detective-quiz";
import { dealDetectiveDealKey, issueSupermarketShowdownChallenge, submitSupermarketShowdown } from "@/lib/deal-detective-quiz";
import DealDetectiveConfetti from "@/components/DealDetectiveConfetti";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";

interface SupermarketShowdownProps {
  showdownCase: SupermarketShowdownCase;
  accessToken: string | null;
  onDone: () => void;
  onPlayed: (showdownCase: SupermarketShowdownCase) => void;
}

function currency(price: number): string {
  return `$${price.toFixed(2)}`;
}

export default function SupermarketShowdown({ showdownCase, accessToken, onDone, onPlayed }: SupermarketShowdownProps) {
  const [selectedDealKey, setSelectedDealKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoreResult, setScoreResult] = useState<DealDetectiveQuizResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const answered = selectedDealKey !== null;
  const selectedSide: DealDetectiveQuizSide | null = selectedDealKey === showdownCase.correctDealKey ? "left" : answered ? "right" : null;
  const difference = showdownCase.rightDeal.price - showdownCase.leftDeal.price;
  const cheaperStore = showdownCase.leftDeal.store;
  const cheaperPrice = showdownCase.leftDeal.price;

  const saveAnswer = async (dealKey: string) => {
    if (isSubmitting) return;
    if (!accessToken) {
      onPlayed(showdownCase);
      return;
    }

    setIsSubmitting(true);
    setSaveError(null);
    try {
      const challenge = await issueSupermarketShowdownChallenge(showdownCase);
      const side = dealKey === showdownCase.correctDealKey ? "left" : "right";
      const result = await submitSupermarketShowdown(showdownCase, side, accessToken, challenge.challenge_token);
      setScoreResult(result);
      onPlayed(showdownCase);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We couldn’t save your answer right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const chooseStore = (dealKey: string) => {
    if (answered || isSubmitting) return;
    setSelectedDealKey(dealKey);
    void saveAnswer(dealKey);
  };

  const renderStoreChoice = (deal: SupermarketShowdownCase["leftDeal"], index: number) => {
    const dealKey = dealDetectiveDealKey(showdownCase.product.id, deal.store);
    const isCorrect = dealKey === showdownCase.correctDealKey;
    const isSelected = dealKey === selectedDealKey;
    return (
      <button
        key={dealKey}
        type="button"
        disabled={answered || isSubmitting}
        aria-pressed={isSelected}
        onClick={() => void chooseStore(dealKey)}
        className={`flex min-w-0 flex-col items-center gap-2 rounded-2xl border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 disabled:cursor-default sm:p-3 ${answered && isCorrect ? "border-fair-500 bg-fair-50" : answered && isSelected ? "border-alert-300 bg-alert-50" : "border-stone-200 bg-white hover:bg-stone-50"}`}
      >
        <motion.div
          key={answered ? `revealed-${dealKey}` : `covered-${dealKey}`}
          initial={answered && !prefersReducedMotion ? { rotateY: 88, opacity: 0.25 } : false}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.42, delay: index * 0.055, ease: [0.22, 0.7, 0.25, 1] }}
          style={{ transformPerspective: 900, backfaceVisibility: "hidden" }}
          className="flex w-full flex-col items-center gap-1"
        >
          <StoreLogoBadge store={deal.store} variant="showdown" decorative />
          <span className="line-clamp-2 min-h-9 dd-type-meta dd-type-meta-strong text-stone-900">{deal.store}</span>
          {answered
            ? <span className="font-display text-lg font-extrabold tabular-nums text-stone-900">{currency(deal.price)}</span>
            : (
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 dd-type-meta dd-type-meta-strong text-stone-600">
                <span className="material-symbols-outlined text-[16px] leading-none" style={{ fontVariationSettings: "'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20" }} aria-hidden="true">touch_app</span>
                Tap to pick
              </span>
            )}
          {answered && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 dd-type-meta dd-type-meta-strong ${isCorrect ? "bg-fair-100 text-fair-900" : isSelected ? "bg-alert-100 text-alert-900" : "bg-stone-100 text-stone-700"}`}>
              {isCorrect ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : isSelected ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {isCorrect ? "Cheapest" : isSelected ? "Not cheapest" : "Higher price"}
            </span>
          )}
        </motion.div>
      </button>
    );
  };

  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col px-5 pb-6 pt-16" aria-busy={isSubmitting}>
      {answered && selectedSide === showdownCase.correctSide && <DealDetectiveConfetti key={selectedDealKey} />}
      <div className="mb-4 flex flex-col items-center gap-2 text-center">
        <h2 id="new-specials-title" className="font-display text-xl font-extrabold text-stone-900">Which store has the better price?</h2>
        <p id="new-specials-description" className="dd-type-secondary text-stone-600">Pick one to reveal today’s prices.</p>
      </div>

      <div className="mb-4 flex flex-col items-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-center shadow-xs">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl bg-stone-50 p-2">
          <ProductImage src={showdownCase.product.image} alt="" width={112} height={112} sizes="112px" className="h-full w-full object-contain mix-blend-multiply" />
        </div>
        <p className="mt-2 dd-type-control dd-type-control-strong text-stone-900">{showdownCase.product.name}</p>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${showdownCase.choices.length}, minmax(0, 1fr))` }}
        role="group"
        aria-label={`Choose the cheapest supermarket from ${showdownCase.choices.length} stores`}
      >
        {showdownCase.choices.map(renderStoreChoice)}
      </div>

      <AnimatePresence>
        {answered && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
            className="mt-4 flex min-h-[8rem] flex-col justify-center rounded-2xl border border-stone-200 bg-white px-5 py-4 text-center shadow-xs"
            role="status"
            aria-live="polite"
          >
            <p className={`dd-type-control dd-type-control-strong ${selectedSide === showdownCase.correctSide ? "text-fair-900" : "text-alert-900"}`}>
              {selectedSide === showdownCase.correctSide ? "Good spotting!" : "Close call!"}
            </p>
            <p className="mt-2 dd-type-secondary leading-5 text-stone-700">
              {cheaperStore} has the lowest price at {currency(cheaperPrice)} — {currency(difference)} less than the next cheapest.
            </p>
            {accessToken && scoreResult && <p className="mt-2 dd-type-meta text-stone-500">{scoreResult.points_awarded > 0 ? "+1 detective point" : "Your score is up to date."}</p>}
            {accessToken && !scoreResult && isSubmitting && <p className="mt-2 dd-type-meta text-stone-500">Saving your answer…</p>}
            {accessToken && saveError && <p className="mt-2 dd-type-meta text-alert-700" role="alert"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{saveError}</p>}
            {saveError && accessToken && (
              <button type="button" onClick={() => void saveAnswer(selectedDealKey!)} className="mt-2 dd-type-meta dd-type-meta-strong text-ink-900 underline underline-offset-4">Try saving again</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto pt-6">
        <button type="button" disabled={!answered || isSubmitting} onClick={onDone} className="dd-btn dd-btn-primary min-h-12 w-full cursor-pointer disabled:cursor-default disabled:opacity-50">
          {answered ? "Done" : "Choose a supermarket"}
        </button>
      </div>
    </div>
  );
}
