"use client";

import type { CheckDealsSummaryStore } from "@/lib/check-deals-home";
import StoreLogoBadge from "@/components/StoreLogoBadge";

const SUMMARY_STORES: Array<{ key: CheckDealsSummaryStore; label: string }> = [
  { key: "newworld", label: "New World" },
  { key: "paknsave", label: "Pak’n Save" },
  { key: "woolworths", label: "Woolworths" },
];

export default function CheckDealsSummary({
  counts,
  updatedText,
  updatedLabel,
  onOpenStoreDeals,
}: {
  counts: Record<CheckDealsSummaryStore, number>;
  updatedText: string | null;
  updatedLabel: string;
  onOpenStoreDeals: (store: CheckDealsSummaryStore) => void;
}) {
  return (
    <section className="mx-5 rounded-3xl border border-stone-200/80 bg-white px-5 py-5 shadow-xs" aria-labelledby="current-specials-title">
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-2" aria-label={updatedLabel}>
          <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-fair-500">
            LIVE
          </span>
          {updatedText && <span className="dd-type-meta dd-type-meta-strong text-stone-500">{updatedText}</span>}
        </div>
        <h1 id="current-specials-title" className="dd-type-section whitespace-nowrap text-stone-900">Current specials by supermarket</h1>
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-stone-200/80 overflow-hidden rounded-2xl border border-stone-200/80 bg-fair-50 shadow-xs" role="group" aria-label="Current special counts by supermarket">
        {SUMMARY_STORES.map(({ key, label }) => {
          return (
            <button
              key={key}
              type="button"
              aria-label={`See ${label} deals: ${counts[key]} current specials`}
              onClick={() => onOpenStoreDeals(key)}
              className="flex min-w-0 cursor-pointer flex-col items-center gap-2 px-2 py-5 text-center transition-colors hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2"
            >
              <StoreLogoBadge store={key} variant="ranking" decorative />
              <span className="text-xl font-black leading-none tabular-nums text-fair-800">{counts[key]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
