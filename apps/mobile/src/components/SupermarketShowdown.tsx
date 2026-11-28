"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LockKeyhole, Pointer } from "lucide-react";
import { fetchPriceHistory90d, getAssessmentVerdict } from "@dodgey-deals/shared";
import type { DealDetectiveQuizResult, DealDetectiveQuizSide, SupermarketShowdownCase } from "@/lib/deal-detective-quiz";
import { dealDetectiveDealKey, issueSupermarketShowdownChallenge, submitSupermarketShowdown } from "@/lib/deal-detective-quiz";
import DealDetectiveConfetti from "@/components/DealDetectiveConfetti";
import PriceHistoryChart, { ALL_STORES_VALUE, type PriceHistorySeries } from "@/components/PriceHistoryChart";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { supabaseConfig } from "@/lib/config";

interface SupermarketShowdownProps {
  showdownCase: SupermarketShowdownCase;
  accessToken: string | null;
  onDone: () => void;
  onPlayed: (showdownCase: SupermarketShowdownCase) => void;
}

function currency(price: number): string {
  return `$${price.toFixed(2)}`;
}

interface ShowdownPriceHistoryState {
  loading: boolean;
  error: boolean;
  series: PriceHistorySeries[];
  unavailableStoreCount: number;
}

const PRICE_HISTORY_REVEAL_DELAY_MS = 1_700;

export default function SupermarketShowdown({ showdownCase, accessToken, onDone, onPlayed }: SupermarketShowdownProps) {
  const [selectedDealKey, setSelectedDealKey] = useState<string | null>(null);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [priceHistoryState, setPriceHistoryState] = useState<ShowdownPriceHistoryState>({
    loading: false,
    error: false,
    series: [],
    unavailableStoreCount: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scoreResult, setScoreResult] = useState<DealDetectiveQuizResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const answered = selectedDealKey !== null;
  const selectedSide: DealDetectiveQuizSide | null = selectedDealKey === showdownCase.correctDealKey ? "left" : answered ? "right" : null;
  const difference = showdownCase.rightDeal.price - showdownCase.leftDeal.price;
  const cheaperStore = showdownCase.leftDeal.store;
  const cheaperPrice = showdownCase.leftDeal.price;
  useEffect(() => {
    if (!answered) return;

    let cancelled = false;
    const historyRequests = showdownCase.choices.flatMap((deal) => {
      if (!deal.sourceProductId || !deal.sourceStoreId) return [];
      return [{
        deal,
        request: fetchPriceHistory90d(supabaseConfig, deal.sourceProductId, deal.sourceStoreId),
      }];
    });
    if (historyRequests.length === 0) return () => { cancelled = true; };

    void Promise.allSettled(historyRequests.map(async ({ deal, request }) => ({
      deal,
      points: await request,
    }))).then((results) => {
      if (cancelled) return;
      const series = results.flatMap((result) => {
        if (result.status !== "fulfilled" || result.value.points.length === 0) return [];
        const { deal, points } = result.value;
        return [{
          store: deal.store,
          points,
          currentPrice: deal.price,
          currentIsSpecial: deal.isOnSpecial,
          verdict: getAssessmentVerdict(deal),
        }];
      });
      const unavailableStoreCount = showdownCase.choices.length - series.length;
      setPriceHistoryState({
        loading: false,
        error: series.length === 0,
        series,
        unavailableStoreCount,
      });
    });

    return () => { cancelled = true; };
  }, [answered, showdownCase.choices]);

  useEffect(() => {
    if (!answered) return;
    const revealTimer = window.setTimeout(() => setShowPriceHistory(true), PRICE_HISTORY_REVEAL_DELAY_MS);
    return () => window.clearTimeout(revealTimer);
  }, [answered]);

  const verdictByDealKey = useMemo(() => {
    const prices = showdownCase.choices.map((deal) => deal.price);
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    return new Map(showdownCase.choices.map((deal) => {
      const isBest = deal.price <= lowestPrice + 0.005;
      const isWorst = deal.price >= highestPrice - 0.005;
      return [
        dealDetectiveDealKey(showdownCase.product.id, deal.store),
        isBest
          ? { label: "Best", className: "bg-fair-100 text-fair-900" }
          : isWorst
            ? { label: "Worst", className: "bg-alert-100 text-alert-900" }
            : { label: "High", className: "bg-stone-100 text-stone-700" },
      ] as const;
    }));
  }, [showdownCase.choices, showdownCase.product.id]);

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
    const availableHistoryCount = showdownCase.choices.filter((deal) => deal.sourceProductId && deal.sourceStoreId).length;
    setPriceHistoryState({
      loading: availableHistoryCount > 0,
      error: availableHistoryCount === 0,
      series: [],
      unavailableStoreCount: 0,
    });
    setSelectedDealKey(dealKey);
    void saveAnswer(dealKey);
  };

  const renderStoreChoice = (deal: SupermarketShowdownCase["leftDeal"], index: number) => {
    const dealKey = dealDetectiveDealKey(showdownCase.product.id, deal.store);
    const isCorrect = dealKey === showdownCase.correctDealKey;
    const isSelected = dealKey === selectedDealKey;
    const verdict = verdictByDealKey.get(dealKey) ?? { label: "High", className: "bg-stone-100 text-stone-700" };
    return (
      <button
        key={dealKey}
        type="button"
        disabled={answered || isSubmitting}
        aria-pressed={isSelected}
        onClick={() => void chooseStore(dealKey)}
        className={`flex h-full min-h-[9rem] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 disabled:cursor-default sm:p-3 ${answered && isCorrect ? "border-fair-500 bg-fair-50" : answered && isSelected ? "border-alert-300 bg-alert-50" : "border-stone-200 bg-white hover:bg-stone-50"}`}
      >
        <motion.div
          key={answered ? `revealed-${dealKey}` : `covered-${dealKey}`}
          initial={answered && !prefersReducedMotion ? { rotateY: 88, opacity: 0.25 } : false}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.42, delay: index * 0.055, ease: [0.22, 0.7, 0.25, 1] }}
          style={{ transformPerspective: 900, backfaceVisibility: "hidden" }}
          className="flex h-full w-full flex-col items-center justify-center gap-1"
        >
          <StoreLogoBadge store={deal.store} variant="showdown" decorative />
          <span className="line-clamp-2 min-h-9 dd-type-meta dd-type-meta-strong text-stone-900">{deal.store}</span>
          {answered
            ? <span className="font-display text-lg font-extrabold tabular-nums text-stone-900">{currency(deal.price)}</span>
            : null}
          {answered && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 dd-type-meta dd-type-meta-strong ${verdict.className}`}>
              {verdict.label}
            </span>
          )}
        </motion.div>
      </button>
    );
  };

  return (
    <div className="relative isolate flex min-h-full flex-1 flex-col px-5 pb-6 pt-16" aria-busy={isSubmitting}>
      {answered && !showPriceHistory && selectedSide === showdownCase.correctSide && <DealDetectiveConfetti key={selectedDealKey} />}
      <AnimatePresence mode="wait" initial={false}>
        {showPriceHistory ? (
          <motion.div
            key="showdown-price-history"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
            className="flex flex-1 flex-col"
          >
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-xs">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-50 p-1.5">
                <ProductImage src={showdownCase.product.image} alt="" width={64} height={64} sizes="64px" className="h-full w-full object-contain mix-blend-multiply" />
              </div>
              <div className="min-w-0">
                <h2 id="new-specials-title" className="font-display text-lg font-extrabold text-stone-900">90-day price history</h2>
                <p id="new-specials-description" className="mt-1 line-clamp-2 dd-type-secondary text-stone-600">{showdownCase.product.name}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white px-3 py-4 shadow-xs">
              <PriceHistoryChart
                points={[]}
                currentPrice={showdownCase.choices[0].price}
                currentStore={showdownCase.choices[0].store}
                currentIsSpecial={showdownCase.choices[0].isOnSpecial}
                loading={priceHistoryState.loading}
                error={priceHistoryState.error ? "history-unavailable" : null}
                verdict={getAssessmentVerdict(showdownCase.choices[0])}
                historySeries={priceHistoryState.series}
                selectedStore={ALL_STORES_VALUE}
                animateOnMount
              />
              {priceHistoryState.unavailableStoreCount > 0 && priceHistoryState.series.length > 0 && (
                <p className="mt-2 text-center dd-type-meta text-stone-500" role="status">
                  History isn’t available for {priceHistoryState.unavailableStoreCount} {priceHistoryState.unavailableStoreCount === 1 ? "supermarket" : "supermarkets"}.
                </p>
              )}
            </div>
            {saveError && accessToken && (
              <div className="mt-3 text-center" role="alert">
                <p className="dd-type-meta text-alert-700"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{saveError}</p>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => selectedDealKey && void saveAnswer(selectedDealKey)}
                  className="mt-2 dd-type-meta dd-type-meta-strong text-ink-900 underline underline-offset-4 disabled:opacity-60"
                >
                  {isSubmitting ? "Saving your answer…" : "Try saving again"}
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="showdown-choice-step"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -5 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            className="flex flex-1 flex-col"
          >
            <div className="mb-4 flex flex-col items-center text-center">
              <h2 id="new-specials-title" className="font-display text-xl font-extrabold text-stone-900">Which store has the better price?</h2>
              <p id="new-specials-description" className="sr-only">Pick a supermarket to reveal today’s prices.</p>
            </div>

            <div className="mb-4 flex flex-col items-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-center shadow-xs">
              <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl bg-stone-50 p-2">
                <ProductImage src={showdownCase.product.image} alt="" width={144} height={144} sizes="144px" className="h-full w-full object-contain mix-blend-multiply" />
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

            {!answered && (
              <p className="mt-3 inline-flex items-center justify-center gap-1.5 text-center dd-type-secondary dd-type-secondary-strong text-stone-600">
                <Pointer className="h-4 w-4 shrink-0" aria-hidden="true" />
                Tap to pick an option
              </p>
            )}

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
