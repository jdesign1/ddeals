"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Info, X } from "lucide-react";
import type { AssessmentVerdict, CurrentDeal } from "@dodgey-deals/shared";
import BottomSheetPortal from "@/components/BottomSheetPortal";

function getEvidenceDetails(deal: CurrentDeal) {
  const days = Number.isFinite(deal.regularHistoryDays)
    ? Math.max(0, Math.round(deal.regularHistoryDays ?? 0))
    : null;
  const checks = Number.isFinite(deal.regularPriceSamples)
    ? Math.max(0, Math.round(deal.regularPriceSamples ?? 0))
    : null;
  const storedDays =
    days || (Number.isFinite(deal.ninetyDayDaysTracked) ? Math.max(0, Math.round(deal.ninetyDayDaysTracked ?? 0)) : null);

  return {
    days,
    checks,
    storedDays,
  };
}

function getConclusionText(verdict: AssessmentVerdict): string {
  if (verdict === "Real Saver") {
    return "This deal is marked as a Real Saver because the current price is meaningfully below the recent normal price.";
  }
  if (verdict === "Dodgy Deal") {
    return "This deal is marked as a Dodgy Deal because the current price is not meaningfully below the recent normal price.";
  }
  if (verdict === "Fair Deal") {
    return "This deal is marked as a Fair Deal because the price is close to the recent normal price rather than a standout saving.";
  }
  if (verdict === "Early read") {
    return "There are some useful signals, but the history is still early. We need more recent checks before calling it a confirmed deal.";
  }
  return "There isn’t enough history yet to make a confident call, so we’ve kept the assessment cautious.";
}

export default function AssessmentEvidenceCard({
  deal,
  verdict,
  evidenceSummary,
}: {
  deal: CurrentDeal;
  verdict: AssessmentVerdict;
  evidenceSummary: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const sheetId = useId();
  const { days, checks, storedDays } = getEvidenceDetails(deal);
  const hasEvidenceCounts = Boolean(days || checks || storedDays);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-controls={sheetId}
        className="mt-3 flex w-full items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-left transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
      >
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-stone-500" strokeWidth={2.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-5 text-stone-600">{evidenceSummary}</span>
        <ChevronRight className="mt-0.5 h-5 w-5 flex-shrink-0 text-stone-400" strokeWidth={2.25} aria-hidden="true" />
      </button>

      <BottomSheetPortal open={isOpen}>
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close evidence details"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] border-0 bg-stone-900/40 p-0"
              />
              <motion.div
                id={sheetId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              >
                <div className="dd-bottom-sheet-titlebar flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                  <h3 id={titleId} className="dd-type-sheet-title text-stone-900">How we assess this deal</h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close"
                    className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-4 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4">
                  <p className="text-[15px] leading-6 text-stone-700">
                    We compare today&rsquo;s price with its recent normal price at this supermarket.
                  </p>

                  {hasEvidenceCounts && (
                    <div className="overflow-hidden rounded-2xl bg-stone-50">
                      <p className="px-4 pb-2 pt-4 text-sm font-bold text-stone-900">Evidence used</p>
                      <dl className="text-sm">
                        {(days || storedDays) && (
                          <div className="flex items-center justify-between gap-4 border-t border-stone-200/70 px-4 py-3">
                            <dt className="text-stone-600">Price history</dt>
                            <dd className="text-right font-semibold text-stone-900">
                              {days ? `${days} day${days === 1 ? "" : "s"}` : `${storedDays} day${storedDays === 1 ? "" : "s"} so far`}
                            </dd>
                          </div>
                        )}
                        {checks && (
                          <div className="flex items-center justify-between gap-4 border-t border-stone-200/70 px-4 py-3">
                            <dt className="text-stone-600">Price checks</dt>
                            <dd className="text-right font-semibold text-stone-900">{checks}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                    <p className="text-sm font-bold text-stone-900">{verdict}</p>
                    <p className="mt-1.5 text-[15px] leading-6 text-stone-700">
                      {getConclusionText(verdict)}
                    </p>
                  </div>

                  <p className="text-sm leading-5 text-stone-500">
                    More history makes the assessment more reliable.
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </BottomSheetPortal>
    </>
  );
}
