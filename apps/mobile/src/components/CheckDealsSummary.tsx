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
  selectedStores,
  onSelectStore,
}: {
  counts: Record<CheckDealsSummaryStore, number>;
  updatedText: string | null;
  updatedLabel: string;
  selectedStores: readonly string[];
  onSelectStore: (store: CheckDealsSummaryStore) => void;
}) {
  return (
    <section className="mx-5 rounded-3xl border-2 border-stone-900 bg-white px-5 py-5" aria-labelledby="current-specials-title">
      <div className="flex items-start justify-between gap-3">
        <h1 id="current-specials-title" className="dd-type-section whitespace-nowrap text-stone-900">Current specials by supermarket</h1>
        <div className="flex shrink-0 flex-col items-end gap-0.5" aria-label={updatedLabel}>
          <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-fair-500">
            LIVE
          </span>
          {updatedText && <span className="dd-type-meta dd-type-meta-strong text-stone-500">{updatedText}</span>}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 divide-x divide-stone-300" role="group" aria-label="Current special counts by supermarket">
        {SUMMARY_STORES.map(({ key, label }) => {
          const selected = selectedStores.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-label={`${label}: ${counts[key]} current specials`}
              aria-pressed={selected}
              onClick={() => onSelectStore(key)}
              className={`flex min-w-0 cursor-pointer flex-col items-center gap-1 px-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 ${selected ? "text-ink-700" : "text-stone-900"}`}
            >
              <StoreLogoBadge store={key} variant="ranking" decorative />
              <span className="font-display text-3xl font-extrabold leading-none tabular-nums">{counts[key]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
