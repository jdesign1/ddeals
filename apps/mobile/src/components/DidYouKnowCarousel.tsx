"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Lightbulb, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import InsightCarousel from "@/components/InsightCarousel";
import {
  getDidYouKnowFingerprint,
  readDidYouKnowSeenState,
  writeDidYouKnowSeenState,
  type DidYouKnowAccent,
  type DidYouKnowCard,
} from "@/lib/did-you-know";

const SEEN_VIEW_DELAY_MS = 850;

interface DidYouKnowCarouselProps {
  cards: readonly DidYouKnowCard[];
  publicationKey: string | null;
  publicationComplete: boolean;
  storageScope: string;
  onBrowse: (card: DidYouKnowCard) => void;
}

const ACCENT_STYLES: Record<DidYouKnowAccent, {
  card: string;
  eyebrow: string;
  metric: string;
  detail: string;
  icon: typeof Lightbulb;
}> = {
  fair: {
    card: "border-fair-100 bg-fair-50",
    eyebrow: "text-fair-800",
    metric: "text-fair-900",
    detail: "text-fair-900/75",
    icon: Sparkles,
  },
  ink: {
    card: "border-ink-800 bg-ink-900",
    eyebrow: "text-fair-300",
    metric: "text-white",
    detail: "text-white/75",
    icon: TrendingUp,
  },
  alert: {
    card: "border-alert-200 bg-alert-50",
    eyebrow: "text-alert-800",
    metric: "text-alert-900",
    detail: "text-alert-900/75",
    icon: ShieldAlert,
  },
};

function formatMetric(card: DidYouKnowCard): string {
  const value = new Intl.NumberFormat("en-NZ", {
    maximumFractionDigits: card.metricFormat === "percentage" ? 1 : 0,
  }).format(card.metric);
  return card.metricFormat === "percentage" ? `${value}%` : value;
}

function DidYouKnowCardView({ card, onBrowse }: { card: DidYouKnowCard; onBrowse: () => void }) {
  const styles = ACCENT_STYLES[card.accent];
  const Icon = styles.icon;
  const isDark = card.accent === "ink";

  return (
    <button
      type="button"
      onClick={onBrowse}
      aria-label={`${card.supportingText} Explore ${card.category} deals.`}
      className={`group flex h-[10.5rem] w-full cursor-pointer flex-col rounded-3xl border p-5 text-left shadow-xs transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 ${styles.card}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className={`flex items-center gap-2 dd-type-badge font-bold uppercase tracking-[0.08em] ${styles.eyebrow}`}>
          <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          Did you know?
        </span>
        <ArrowRight className={`h-4 w-4 shrink-0 transition-transform group-active:translate-x-0.5 ${isDark ? "text-white/70" : styles.eyebrow}`} aria-hidden="true" />
      </span>

      <span className="mt-3 flex items-end gap-2">
        <span className={`dd-type-display leading-none tabular-nums ${styles.metric}`}>{formatMetric(card)}</span>
        <span className={`pb-0.5 dd-type-meta dd-type-meta-strong leading-tight ${styles.detail}`}>{card.metricLabel}</span>
      </span>

      <span className={`mt-2 line-clamp-2 dd-type-control ${isDark ? "text-white" : "text-stone-900"}`}>
        {card.supportingText}
      </span>
      <span className={`mt-auto flex items-center justify-between gap-3 dd-type-meta dd-type-meta-strong ${styles.detail}`}>
        <span className="line-clamp-1">{card.category}</span>
        {card.progress !== null && (
          <span className={`h-1.5 w-12 shrink-0 overflow-hidden rounded-full ${isDark ? "bg-white/20" : "bg-black/10"}`} aria-hidden="true">
            <span className={`block h-full rounded-full ${card.accent === "alert" ? "bg-alert-600" : "bg-fair-600"}`} style={{ width: `${card.progress}%` }} />
          </span>
        )}
      </span>
    </button>
  );
}

export default function DidYouKnowCarousel({ cards, publicationKey, publicationComplete, storageScope, onBrowse }: DidYouKnowCarouselProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [seenState, setSeenState] = useState<ReturnType<typeof readDidYouKnowSeenState>>(null);
  const [storageReady, setStorageReady] = useState(false);
  const fingerprint = useMemo(() => getDidYouKnowFingerprint(cards), [cards]);

  // These effects hydrate and reconcile a localStorage-backed unread cue.
  // The state writes are the subscription bridge for that external store.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setStorageReady(false);
    setSeenState(readDidYouKnowSeenState(storageScope));
    setStorageReady(true);
  }, [storageScope]);

  useEffect(() => {
    if (!storageReady || !publicationComplete || !publicationKey || !fingerprint) return;
    if (!seenState) {
      const initialState = { version: 1 as const, publicationKey, fingerprint };
      if (writeDidYouKnowSeenState(initialState, storageScope)) setSeenState(initialState);
      return;
    }
    if (seenState.publicationKey !== publicationKey && seenState.fingerprint === fingerprint) {
      const currentState = { version: 1 as const, publicationKey, fingerprint };
      if (writeDidYouKnowSeenState(currentState, storageScope)) setSeenState(currentState);
    }
  }, [fingerprint, publicationComplete, publicationKey, seenState, storageReady, storageScope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasNewInsight = Boolean(
    storageReady
    && publicationComplete
    && publicationKey
    && seenState
    && seenState.publicationKey !== publicationKey
    && seenState.fingerprint !== fingerprint,
  );

  const markSeen = useCallback(() => {
    if (!publicationComplete || !publicationKey || !fingerprint) return;
    const nextState = { version: 1 as const, publicationKey, fingerprint };
    if (writeDidYouKnowSeenState(nextState, storageScope)) setSeenState(nextState);
  }, [fingerprint, publicationComplete, publicationKey, storageScope]);

  useEffect(() => {
    if (!hasNewInsight) return;
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;

    let timer: number | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.65 || timer !== null) return;
      timer = window.setTimeout(markSeen, SEEN_VIEW_DELAY_MS);
    }, { threshold: [0.65] });
    observer.observe(section);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [hasNewInsight, markSeen]);

  if (cards.length === 0) return null;

  return (
    <section ref={sectionRef} className="flex flex-col gap-3 bg-white py-4" aria-labelledby="did-you-know-title">
      <div className="mx-5 flex items-center gap-3">
        <h2 id="did-you-know-title" className="flex items-center gap-2 dd-type-section text-stone-900">
          Did you know?
          {hasNewInsight && (
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0" title="New insight">
              <span className="relative h-2.5 w-2.5 rounded-full bg-alert-600" aria-hidden="true" />
              <span className="sr-only">New insight</span>
            </span>
          )}
        </h2>
      </div>
      <InsightCarousel
        ariaLabel="Did you know discovery cards"
        slideWidthClassName="w-[92%]"
        trackPaddingClassName="px-5"
      >
        {cards.map((card) => (
          <DidYouKnowCardView key={`${card.id}-${card.category}`} card={card} onBrowse={() => {
            markSeen();
            onBrowse(card);
          }} />
        ))}
      </InsightCarousel>
    </section>
  );
}
