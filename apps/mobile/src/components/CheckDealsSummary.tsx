"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckDealsSummaryStore } from "@/lib/check-deals-home";
import StoreLogoBadge from "@/components/StoreLogoBadge";

const SUMMARY_STORES: Array<{ key: CheckDealsSummaryStore; label: string }> = [
  { key: "newworld", label: "New World" },
  { key: "paknsave", label: "Pak’n Save" },
  { key: "woolworths", label: "Woolworths" },
];

type SummaryCounts = Record<CheckDealsSummaryStore, number>;

const COUNT_ANIMATION_DELAY_MS = 350;
const COUNT_ANIMATION_DURATION_MS = 1400;
const ZERO_COUNTS: SummaryCounts = {
  newworld: 0,
  paknsave: 0,
  woolworths: 0,
};

// Keep this entrance moment to once per client app session, including when
// the Check Deals route is temporarily unmounted while another tab is open.
let hasPlayedCountAnimation = false;

function easeOutCubic(progress: number): number {
  return 1 - ((1 - progress) ** 3);
}

function interpolateCounts(target: SummaryCounts, progress: number): SummaryCounts {
  return {
    newworld: Math.round(target.newworld * progress),
    paknsave: Math.round(target.paknsave * progress),
    woolworths: Math.round(target.woolworths * progress),
  };
}

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
  const [shouldAnimate] = useState(() => !hasPlayedCountAnimation);
  const initialCountsRef = useRef(counts);
  const [animatedCounts, setAnimatedCounts] = useState<SummaryCounts>(() => (
    shouldAnimate ? ZERO_COUNTS : counts
  ));
  const [isAnimating, setIsAnimating] = useState(shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) return;

    let animationFrame: number | null = null;
    const delayTimer = window.setTimeout(() => {
      hasPlayedCountAnimation = true;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setIsAnimating(false);
        return;
      }

      const startedAt = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - startedAt) / COUNT_ANIMATION_DURATION_MS, 1);
        setAnimatedCounts(interpolateCounts(initialCountsRef.current, easeOutCubic(progress)));

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };

      animationFrame = window.requestAnimationFrame(animate);
    }, COUNT_ANIMATION_DELAY_MS);

    return () => {
      window.clearTimeout(delayTimer);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [shouldAnimate]);

  const visibleCounts = isAnimating ? animatedCounts : counts;

  return (
    <section className="mt-2 bg-white py-5" aria-labelledby="current-specials-title">
      <div className="mx-5">
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2" aria-label={updatedLabel}>
            <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[10px] font-bold uppercase leading-none tracking-[0.08em] text-fair-500">
              LIVE
            </span>
            {updatedText && <span className="dd-type-meta dd-type-meta-strong text-stone-500">{updatedText}</span>}
          </div>
          <h1 id="current-specials-title" className="dd-type-section whitespace-nowrap text-stone-900">Current specials by supermarket</h1>
        </div>
        <div className="mt-4 grid w-full grid-cols-3 divide-x divide-stone-200/80 overflow-hidden rounded-2xl border border-stone-200/80 bg-fair-50 shadow-xs" role="group" aria-label="Current special counts by supermarket">
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
                <span className="text-xl font-black leading-none tabular-nums text-fair-800">{visibleCounts[key]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
