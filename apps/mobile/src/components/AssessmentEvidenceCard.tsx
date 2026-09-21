"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Info, X } from "lucide-react";
import type { AssessmentVerdict, CurrentDeal, PriceHistoryPoint } from "@dodgey-deals/shared";
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

function formatCount(value: number | null | undefined, singular: string, plural = `${singular}s`): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const count = Math.round(value);
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildStepPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    return `${path} L ${point.x} ${previous.y} L ${point.x} ${point.y}`;
  }, "");
}

function MiniEvidenceChart({
  points,
  currentPrice,
  comparisonPrice,
  currentIsSpecial,
  loading,
}: {
  points: PriceHistoryPoint[];
  currentPrice: number;
  comparisonPrice: number | null;
  currentIsSpecial: boolean;
  loading: boolean;
}) {
  const now = Date.now();
  const windowMs = 90 * 24 * 60 * 60 * 1000;
  const start = now - windowMs;
  const observed = points
    .filter((point) => point.price > 0 && Number.isFinite(point.price) && Number.isFinite(new Date(point.scrapedAt).getTime()))
    .sort((a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime());
  const carryIn = observed.filter((point) => new Date(point.scrapedAt).getTime() < start).at(-1);
  const inWindow = observed.filter((point) => new Date(point.scrapedAt).getTime() >= start && new Date(point.scrapedAt).getTime() <= now);
  const chartPoints = [...(carryIn ? [carryIn] : []), ...inWindow];
  const last = chartPoints.at(-1);
  if (last && (last.price !== currentPrice || new Date(last.scrapedAt).getTime() < now - 60_000)) {
    chartPoints.push({ price: currentPrice, isSpecial: currentIsSpecial, scrapedAt: new Date(now).toISOString() });
  }

  if (loading) {
    return <div className="flex h-36 items-center justify-center rounded-2xl bg-stone-50 text-sm font-semibold text-stone-500">Loading history…</div>;
  }

  if (chartPoints.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded-2xl bg-stone-50 px-6 text-center text-sm leading-5 font-semibold text-stone-500">
        Not enough recorded history to draw a reliable trend yet.
      </div>
    );
  }

  const chartWidth = 360;
  const chartHeight = 144;
  const plotTop = 12;
  const plotBottom = 108;
  const prices = chartPoints.map((point) => point.price);
  if (comparisonPrice != null && comparisonPrice > 0) prices.push(comparisonPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spread = maxPrice - minPrice;
  const padding = spread > 0 ? spread * 0.16 : Math.max(maxPrice * 0.12, 0.5);
  const yMin = Math.max(0, minPrice - padding);
  const yMax = maxPrice + padding;
  const yRange = yMax - yMin || 1;
  const xFor = (scrapedAt: string) => 8 + (Math.min(now, Math.max(start, new Date(scrapedAt).getTime())) - start) / windowMs * (chartWidth - 16);
  const yFor = (price: number) => plotBottom - ((price - yMin) / yRange) * (plotBottom - plotTop);
  const coordinates = chartPoints.map((point) => ({ point, x: xFor(point.scrapedAt), y: yFor(point.price) }));
  const normalY = comparisonPrice != null && comparisonPrice > 0 ? yFor(comparisonPrice) : null;
  const current = coordinates.at(-1);
  const ariaLabel = `90-day price history with ${chartPoints.length} recorded observations${comparisonPrice ? ` and a recent normal price of $${comparisonPrice.toFixed(2)}` : ""}.`;

  return (
    <div className="rounded-2xl bg-stone-50 px-3 pb-2 pt-3">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-36 w-full" role="img" aria-label={ariaLabel}>
        {normalY != null && (
          <>
            <line x1="8" x2="352" y1={normalY} y2={normalY} stroke="var(--dd-chart-average)" strokeDasharray="5 4" strokeWidth="1.5" />
            <text x="350" y={Math.max(12, normalY - 5)} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--dd-chart-average)">
              Normal ${comparisonPrice!.toFixed(2)}
            </text>
          </>
        )}
        <path d={buildStepPath(coordinates)} fill="none" stroke="var(--dd-chart-regular)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map(({ point, x, y }) => (
          <circle
            key={`${point.scrapedAt}-${point.price}`}
            cx={x}
            cy={y}
            r={point === chartPoints.at(-1) ? 6 : 3.5}
            fill={point.isSpecial ? "var(--dd-chart-special)" : "var(--dd-chart-regular)"}
            stroke="var(--dd-chart-point-stroke)"
            strokeWidth="1.5"
          />
        ))}
        <text x="8" y="132" fontSize="10" fontWeight="700" fill="var(--dd-chart-axis)">90 days ago</text>
        <text x="352" y="132" textAnchor="end" fontSize="10" fontWeight="700" fill="var(--dd-chart-axis)">Today</text>
      </svg>
      <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-semibold text-stone-500">
        <span>Recorded prices</span>
        {current && <span>Now ${current.point.price.toFixed(2)}</span>}
      </div>
    </div>
  );
}

export default function AssessmentEvidenceCard({
  deal,
  verdict,
  evidenceSummary,
  priceHistoryPoints,
  priceHistoryLoading,
  comparisonPrice,
}: {
  deal: CurrentDeal;
  verdict: AssessmentVerdict;
  evidenceSummary: string;
  priceHistoryPoints: PriceHistoryPoint[];
  priceHistoryLoading: boolean;
  comparisonPrice: number | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const sheetId = useId();
  const { days, checks, storedDays } = getEvidenceDetails(deal);
  const ninetyDayChecks = formatCount(deal.ninetyDaySamples, "check");
  const trackedDays = formatCount(deal.ninetyDayDaysTracked ?? days ?? storedDays, "day");
  const priceChanges = formatCount(deal.ninetyDayPriceChanges, "change");
  const hasEvidenceCounts = Boolean(days || checks || storedDays || ninetyDayChecks || trackedDays || priceChanges);

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
                    <div className="overflow-hidden rounded-2xl bg-stone-50 px-4 py-3">
                      <p className="text-sm font-bold text-stone-900">Evidence from the last 90 days</p>
                      <div className="mt-3 grid grid-cols-3 divide-x divide-stone-200/80 text-center">
                        <div className="px-2 first:pl-0 last:pr-0">
                          <p className="text-base font-extrabold text-stone-900">{ninetyDayChecks ?? formatCount(checks, "check") ?? "—"}</p>
                          <p className="mt-0.5 text-[11px] leading-4 font-semibold text-stone-500">checks</p>
                        </div>
                        <div className="px-2 first:pl-0 last:pr-0">
                          <p className="text-base font-extrabold text-stone-900">{trackedDays ?? "—"}</p>
                          <p className="mt-0.5 text-[11px] leading-4 font-semibold text-stone-500">days tracked</p>
                        </div>
                        <div className="px-2 first:pl-0 last:pr-0">
                          <p className="text-base font-extrabold text-stone-900">{priceChanges ?? "—"}</p>
                          <p className="mt-0.5 text-[11px] leading-4 font-semibold text-stone-500">price changes</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-sm font-bold text-stone-900">Price history</p>
                    <MiniEvidenceChart
                      points={priceHistoryPoints}
                      currentPrice={deal.price}
                      comparisonPrice={comparisonPrice}
                      currentIsSpecial={deal.isOnSpecial !== false}
                      loading={priceHistoryLoading}
                    />
                    <p className="mt-2 text-xs leading-4 text-stone-500">The dotted line is the recent normal price. Dots show recorded observations.</p>
                  </div>

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
