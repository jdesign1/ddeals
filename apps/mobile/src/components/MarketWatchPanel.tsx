"use client";

import { useState } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import type { DealFilter } from "@/lib/deal-filters";
import { formatCompactUpdatedText } from "@/lib/check-deals-home";
import type { MarketWatchCategory, MarketWatchStats } from "@/lib/market-watch";

interface MarketWatchPanelProps {
  stats: MarketWatchStats;
  onBrowse: (filter: Extract<DealFilter, "real" | "dodgy">) => void;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NZ").format(value);
}

function ValueDotGrid({ percentage }: { percentage: number }) {
  const filledDots = Math.max(0, Math.min(100, Math.round(percentage)));
  return (
    <div className="grid grid-cols-10 gap-1" aria-hidden="true">
      {Array.from({ length: 100 }, (_, index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
          style={{ backgroundColor: index < filledDots ? "var(--color-verdict-real-saver)" : "rgba(255,255,255,0.2)" }}
        />
      ))}
    </div>
  );
}

function CategoryMixChart({ categories }: { categories: MarketWatchCategory[] }) {
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const selectedCategory = categories.find((category) => category.category === selectedCategoryName) ?? null;

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {categories.map((category) => {
          const isSelected = selectedCategoryName === category.category;
          const details = `${formatNumber(category.real)} Real Savers, ${formatNumber(category.fair)} Fair Deals and ${formatNumber(category.dodgy)} Dodgy ${category.dodgy === 1 ? "deal" : "deals"} out of ${formatNumber(category.assessed)} assessed specials.`;

          return (
            <button
              key={category.category}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${category.category}: ${category.realPercentage}% Real Savers. ${details}`}
              onClick={() => setSelectedCategoryName((current) => current === category.category ? null : category.category)}
              className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 ${isSelected ? "bg-fair-50" : "hover:bg-stone-50"}`}
            >
              <span className="w-[6.75rem] shrink-0 dd-type-meta dd-type-meta-strong leading-4 text-stone-700">{category.category}</span>
              <span className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <span className="h-full bg-fair-600 transition-[width] duration-300" style={{ width: `${category.realPercentage}%` }} />
                <span className="h-full bg-stone-400 transition-[width] duration-300" style={{ width: `${category.fairPercentage}%` }} />
                <span className="h-full bg-alert-600 transition-[width] duration-300" style={{ width: `${category.dodgyPercentage}%` }} />
              </span>
              <span className="w-9 shrink-0 text-right dd-type-meta dd-type-meta-strong tabular-nums text-stone-600">{category.realPercentage}%</span>
            </button>
          );
        })}
      </div>
      {selectedCategory && (
        <p className="mt-3 rounded-xl bg-fair-50 px-3 py-2 dd-type-meta leading-4 text-stone-700" aria-live="polite">
          <span className="font-bold text-stone-900">{selectedCategory.category}:</span>{" "}
          {formatNumber(selectedCategory.real)} Real Savers, {formatNumber(selectedCategory.fair)} Fair Deals and {formatNumber(selectedCategory.dodgy)} Dodgy {selectedCategory.dodgy === 1 ? "deal" : "deals"} out of {formatNumber(selectedCategory.assessed)} assessed specials.
        </p>
      )}
    </div>
  );
}

export default function MarketWatchPanel({ stats, onBrowse }: MarketWatchPanelProps) {
  const updatedText = formatCompactUpdatedText(stats.updatedAt);
  const updatedLabel = stats.updatedAt
    ? `Live data, updated ${updatedText === "now" ? "just now" : updatedText ? `${updatedText} ago` : "recently"}`
    : "Live data";
  const atLowSummary = `${formatNumber(stats.realSaversAtNinetyDayLow)} of ${formatNumber(stats.realSavers)} Real Savers are at their lowest recorded price in 90 days.`;

  if (stats.assessedOffers === 0) {
    return (
      <section className="rounded-2xl border border-stone-100 bg-white p-6 text-center shadow-xs" aria-live="polite">
        <h1 className="dd-type-section text-stone-900">Market Watch is quiet right now</h1>
        <p className="mt-2 dd-type-secondary text-stone-600">Come back soon for the latest verified supermarket specials.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="px-1 pt-2">
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2" aria-label={updatedLabel}>
            <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-fair-500">LIVE</span>
            {updatedText && <span className="dd-type-meta dd-type-meta-strong text-stone-500">{updatedText}</span>}
          </div>
          <h1 className="dd-type-section text-stone-900">Market Watch</h1>
        </div>
        <p className="mt-1 dd-type-secondary text-stone-600">A live view of today&rsquo;s assessed specials across the supermarkets we track.</p>
      </header>

      <section className="overflow-hidden rounded-3xl bg-ink-900 p-5 text-white shadow-xs" aria-labelledby="market-watch-best-value-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/65">Best value right now</p>
            <h2 id="market-watch-best-value-heading" className="sr-only">Best value right now</h2>
            <p className="mt-3 text-4xl font-black leading-none tabular-nums">{formatNumber(stats.realSaversAtNinetyDayLow)}</p>
            <p className="mt-1 text-base font-bold leading-tight">at a 90-day low</p>
          </div>
          <div className="w-24 pt-1">
            <ValueDotGrid percentage={stats.realSaversAtNinetyDayLowPercentage} />
          </div>
        </div>
        <p className="mt-5 max-w-sm text-sm leading-5 text-white/75">{atLowSummary}</p>
        <button type="button" onClick={() => onBrowse("real")} className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2.5 dd-type-control text-ink-900 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900">
          View Real Savers <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>

      {stats.topCategories.length > 0 && (
        <section className="rounded-2xl border border-stone-100 bg-white p-5 shadow-xs" aria-labelledby="market-watch-categories-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="market-watch-categories-heading" className="dd-type-section text-stone-900">Where value is strongest</h2>
              <p className="mt-1 dd-type-secondary text-stone-600">The share of assessed specials that are Real Savers. Tap a row for its mix.</p>
            </div>
            <span className="mt-1 shrink-0 rounded-full bg-fair-50 px-2.5 py-1 dd-type-meta dd-type-meta-strong text-fair-700">Live</span>
          </div>
          <div className="mt-5">
            <CategoryMixChart categories={stats.topCategories} />
          </div>
          <div className="mt-3 flex items-center gap-3 dd-type-meta text-stone-500" aria-label="Deal mix legend">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fair-600" aria-hidden="true" />Real Saver</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-stone-400" aria-hidden="true" />Fair Deal</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-alert-600" aria-hidden="true" />Dodgy</span>
          </div>
          <button type="button" onClick={() => onBrowse("real")} className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 dd-type-control text-fair-700 underline decoration-fair-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
            Browse all Real Savers <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </section>
      )}

      {stats.dodgyDeals > 0 && (
        <button type="button" onClick={() => onBrowse("dodgy")} className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dodgy-200 bg-dodgy-50 p-4 text-left shadow-xs transition-colors hover:bg-dodgy-100/70 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dodgy-700 focus-visible:ring-offset-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-dodgy-100 text-dodgy-900"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block dd-type-meta dd-type-meta-strong uppercase tracking-[0.1em] text-dodgy-900">Dodgy Watch</span>
            <span className="mt-0.5 block dd-type-control text-stone-900">{formatNumber(stats.dodgyDeals)} Dodgy {stats.dodgyDeals === 1 ? "special" : "specials"} flagged today</span>
            {stats.recentlyStartedDodgyDeals > 0 && <span className="mt-0.5 block dd-type-meta text-dodgy-900">{formatNumber(stats.recentlyStartedDodgyDeals)} started in the past week</span>}
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-dodgy-900 transition-transform group-active:translate-x-0.5" aria-hidden="true" />
        </button>
      )}

      <p className="px-1 text-center dd-type-meta text-stone-500">Based on {formatNumber(stats.assessedOffers)} current specials with verified price evidence.</p>
    </div>
  );
}
