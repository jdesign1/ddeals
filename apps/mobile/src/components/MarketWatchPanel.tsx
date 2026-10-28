"use client";

import { ArrowRight, ShieldAlert } from "lucide-react";
import { Bar, BarChart, LabelList, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { DealFilter } from "@/lib/deal-filters";
import type { MarketWatchCategory, MarketWatchStats } from "@/lib/market-watch";

interface MarketWatchPanelProps {
  stats: MarketWatchStats;
  onBrowse: (filter: Extract<DealFilter, "real" | "dodgy">) => void;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NZ").format(value);
}

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
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

function CategoryTooltip({ active, payload }: TooltipContentProps) {
  const category = payload?.[0]?.payload as MarketWatchCategory | undefined;
  if (!active || !category) return null;
  return (
    <div className="w-48 rounded-xl border border-stone-800 bg-stone-900 px-3 py-2.5 text-left shadow-lg">
      <p className="text-[11px] font-bold text-white">{category.category}</p>
      <p className="mt-1 text-[11px] leading-4 text-stone-300">{category.summary}</p>
      {category.dodgy > 0 && <p className="mt-1 text-[11px] font-semibold text-amber-200">{category.dodgy} Dodgy {category.dodgy === 1 ? "deal" : "deals"}</p>}
    </div>
  );
}

function CategoryMixChart({ categories }: { categories: MarketWatchCategory[] }) {
  return (
    <div className="h-60 w-full">
      <BarChart
        responsive
        data={categories}
        layout="vertical"
        margin={{ top: 2, right: 42, bottom: 2, left: 0 }}
        style={{ width: "100%", height: "100%" }}
      >
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="category"
          width={116}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "currentColor", fontSize: 11, fontWeight: 700 }}
          className="text-stone-700"
        />
        <Tooltip trigger="click" cursor={{ fill: "rgba(46, 125, 70, 0.08)" }} content={CategoryTooltip} />
        <Bar dataKey="realPercentage" stackId="deal-mix" fill="var(--color-verdict-real-saver)" isAnimationActive />
        <Bar dataKey="fairPercentage" stackId="deal-mix" fill="var(--color-verdict-fair)" isAnimationActive />
        <Bar dataKey="dodgyPercentage" stackId="deal-mix" fill="var(--color-verdict-dodgy)" radius={[0, 999, 999, 0]} isAnimationActive>
          <LabelList dataKey="realPercentage" position="right" formatter={(value) => `${value}%`} className="fill-stone-600 text-[11px] font-bold" />
        </Bar>
      </BarChart>
    </div>
  );
}

export default function MarketWatchPanel({ stats, onBrowse }: MarketWatchPanelProps) {
  const updatedAt = formatUpdatedAt(stats.updatedAt);
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
        <div className="flex items-center justify-between gap-3">
          <p className="dd-type-meta dd-type-meta-strong uppercase tracking-[0.1em] text-stone-500">Live supermarket value</p>
          {updatedAt && <p className="dd-type-meta text-stone-500">Updated {updatedAt}</p>}
        </div>
        <h1 className="mt-1 dd-type-section text-stone-900">Market Watch</h1>
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
        <button type="button" onClick={() => onBrowse("dodgy")} className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-xs transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block dd-type-meta dd-type-meta-strong uppercase tracking-[0.1em] text-amber-800">Dodgy Watch</span>
            <span className="mt-0.5 block dd-type-control text-stone-900">{formatNumber(stats.dodgyDeals)} Dodgy {stats.dodgyDeals === 1 ? "special" : "specials"} flagged today</span>
            {stats.recentlyStartedDodgyDeals > 0 && <span className="mt-0.5 block dd-type-meta text-stone-600">{formatNumber(stats.recentlyStartedDodgyDeals)} started in the past week</span>}
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-amber-800 transition-transform group-active:translate-x-0.5" aria-hidden="true" />
        </button>
      )}

      <p className="px-1 text-center dd-type-meta text-stone-500">Based on {formatNumber(stats.assessedOffers)} current specials with verified price evidence.</p>
    </div>
  );
}
