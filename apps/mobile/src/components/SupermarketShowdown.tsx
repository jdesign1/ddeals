"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, LockKeyhole, X } from "lucide-react";
import type { DealDetectiveQuizResult, DealDetectiveQuizSide, SupermarketShowdownCase } from "@/lib/deal-detective-quiz";
import { dealDetectiveDealKey, issueSupermarketShowdownChallenge, submitSupermarketShowdown } from "@/lib/deal-detective-quiz";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";

interface SupermarketShowdownProps {
  showdownCase: SupermarketShowdownCase;
  accessToken: string | null;
  onBack: () => void;
  onDone: () => void;
  onPlayed: (showdownCase: SupermarketShowdownCase) => void;
}

function currency(price: number): string {
  return `$${price.toFixed(2)}`;
}

export default function SupermarketShowdown({ showdownCase, accessToken, onBack, onDone, onPlayed }: SupermarketShowdownProps) {
  const [selectedDealKey, setSelectedDealKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoreResult, setScoreResult] = useState<DealDetectiveQuizResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const answered = selectedDealKey !== null;
  const selectedSide: DealDetectiveQuizSide | null = selectedDealKey === showdownCase.correctDealKey ? "left" : answered ? "right" : null;
  const difference = showdownCase.rightDeal.price - showdownCase.leftDeal.price;
  const cheaperStore = showdownCase.leftDeal.store;
  const moreExpensiveStore = showdownCase.rightDeal.store;
  const cheaperPrice = showdownCase.leftDeal.price;
  const moreExpensivePrice = showdownCase.rightDeal.price;

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

  const renderStoreChoice = (deal: SupermarketShowdownCase["leftDeal"]) => {
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
        <StoreLogoBadge store={deal.store} variant="ranking" decorative />
        <span className="line-clamp-2 min-h-10 dd-type-meta dd-type-meta-strong text-stone-900">{deal.store}</span>
        {answered
          ? <span className="font-display text-lg font-extrabold tabular-nums text-stone-900">{currency(deal.price)}</span>
          : <span className="rounded-full bg-stone-100 px-2 py-1 dd-type-meta dd-type-meta-strong text-stone-600">Tap to pick</span>}
        {answered && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 dd-type-meta dd-type-meta-strong ${isCorrect ? "bg-fair-100 text-fair-900" : isSelected ? "bg-alert-100 text-alert-900" : "bg-stone-100 text-stone-700"}`}>
            {isCorrect ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : isSelected ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {isCorrect ? "Cheapest" : isSelected ? "Not cheapest" : "Higher price"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex min-h-full flex-1 flex-col px-5 pb-6 pt-12" aria-busy={isSubmitting}>
      <button type="button" onClick={onBack} className="-ml-2 mb-3 flex min-h-11 w-fit items-center gap-1 rounded-full px-2 dd-type-control text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        Today’s games
      </button>
      <div className="mb-4 flex flex-col items-center gap-2 text-center">
        <p className="dd-type-meta dd-type-meta-strong uppercase tracking-[0.1em] text-stone-500">Supermarket Showdown</p>
        <h2 id="new-specials-title" className="font-display text-xl font-extrabold text-stone-900">Which store has the better price?</h2>
        <p id="new-specials-description" className="dd-type-secondary text-stone-600">Pick one to reveal today’s prices.</p>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
        <ProductImage src={showdownCase.product.image} alt="" width={72} height={72} sizes="72px" className="h-[4.5rem] w-[4.5rem] shrink-0 object-contain" />
        <p className="min-w-0 dd-type-control dd-type-control-strong text-stone-900">{showdownCase.product.name}</p>
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
            className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-center"
            role="status"
            aria-live="polite"
          >
            <p className="dd-type-control dd-type-control-strong text-stone-900">
              {selectedSide === showdownCase.correctSide ? "Good spotting!" : "Close call!"}
            </p>
            <p className="mt-1 dd-type-secondary leading-5 text-stone-700">
              {cheaperStore} has it for {currency(cheaperPrice)} — {currency(difference)} less than {moreExpensiveStore} at {currency(moreExpensivePrice)}.
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
          {answered ? "Back to today’s games" : "Choose a supermarket"}
        </button>
      </div>
    </div>
  );
}
