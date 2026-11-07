"use client";

import { memo } from "react";
import { ChevronRight } from "lucide-react";
import type { DealFilter } from "@/lib/deal-filters";

type VerdictFilter = Exclude<DealFilter, "all">;

const VERDICTS: ReadonlyArray<{
  filter: VerdictFilter;
  label: string;
  textClass: string;
  focusClass: string;
}> = [
  {
    filter: "real",
    label: "Real Savers",
    textClass: "text-fair-800",
    focusClass: "focus-visible:ring-fair-700",
  },
  {
    filter: "dodgy",
    label: "Dodgy Deals",
    textClass: "text-alert-600",
    focusClass: "focus-visible:ring-alert-700",
  },
];

function CheckDealsVerdictSummary({
  realSavers,
  dodgyDeals,
  onOpenFilter,
}: {
  realSavers: number;
  dodgyDeals: number;
  onOpenFilter: (filter: VerdictFilter) => void;
}) {
  return (
    <section className="bg-white py-5" aria-labelledby="current-deal-verdicts-title">
      <div className="mx-5">
        <h2 id="current-deal-verdicts-title" className="dd-type-section leading-tight text-stone-900">
          Current deals by rating
        </h2>
        <div
          className="mt-4 grid w-full grid-cols-2 divide-x divide-stone-200/80 overflow-hidden rounded-2xl border border-stone-200/80 bg-fair-50 shadow-xs"
          role="group"
          aria-label="Current deal counts by rating"
        >
          {VERDICTS.map(({ filter, label, textClass, focusClass }) => {
            const count = filter === "real" ? realSavers : dodgyDeals;
            return (
              <button
                key={filter}
                type="button"
                aria-label={`See ${count} ${label}`}
                onClick={() => onOpenFilter(filter)}
                className={`group flex min-w-0 cursor-pointer flex-col items-center gap-2 px-2 py-5 text-center transition-colors hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 ${focusClass} focus-visible:ring-inset`}
              >
                <span className={`dd-type-control dd-type-control-strong ${textClass}`}>{label}</span>
                <span className={`flex items-center gap-1 text-xl font-black leading-none tabular-nums ${textClass}`}>
                  {count}
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default memo(CheckDealsVerdictSummary);
