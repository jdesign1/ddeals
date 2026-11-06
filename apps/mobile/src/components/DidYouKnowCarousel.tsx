"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import InsightCarousel from "@/components/InsightCarousel";
import {
  getDidYouKnowFingerprint,
  readDidYouKnowSeenState,
  writeDidYouKnowSeenState,
  type DidYouKnowAccent,
  type DidYouKnowCard,
} from "@/lib/did-you-know";

const SEEN_VIEW_DELAY_MS = 850;

const CATEGORY_IMAGES: Record<string, string> = {
  "Fruit & Veg": "/did-you-know/fruit-veg.webp",
  "Meat & Poultry": "/did-you-know/meat-poultry.webp",
  "Fish & Seafood": "/did-you-know/fish-seafood.webp",
  "Fridge & Deli": "/did-you-know/fridge-deli.webp",
  "Dairy & Eggs": "/did-you-know/dairy-eggs.webp",
  Bakery: "/did-you-know/bakery.webp",
  Frozen: "/did-you-know/frozen.webp",
  Pantry: "/did-you-know/pantry.webp",
  "Beer & Wine": "/did-you-know/beer-wine.webp",
  Drinks: "/did-you-know/drinks.webp",
  "Health & Body": "/did-you-know/health-body.webp",
  "Household & Cleaning": "/did-you-know/household-cleaning.webp",
  "Baby & Child": "/did-you-know/baby-child.webp",
  Pets: "/did-you-know/pets.webp",
};

interface DidYouKnowCarouselProps {
  cards: readonly DidYouKnowCard[];
  publicationKey: string | null;
  publicationComplete: boolean;
  storageScope: string;
  flushTop?: boolean;
  onBrowse: (card: DidYouKnowCard) => void;
}

const ACCENT_STYLES: Record<DidYouKnowAccent, {
  card: string;
  metric: string;
  detail: string;
}> = {
  fair: {
    card: "border-fair-100 bg-fair-50",
    metric: "text-fair-900",
    detail: "text-fair-900/75",
  },
  neutral: {
    card: "border-stone-200 bg-stone-100",
    metric: "text-stone-900",
    detail: "text-stone-700",
  },
  alert: {
    card: "border-alert-200 bg-alert-50",
    metric: "text-alert-900",
    detail: "text-alert-900/75",
  },
};

function formatMetric(card: DidYouKnowCard): string {
  const value = new Intl.NumberFormat("en-NZ", {
    useGrouping: false,
    maximumFractionDigits: card.metricFormat === "percentage" ? 1 : 0,
  }).format(card.metric);
  return card.metricFormat === "percentage" ? `${value}%` : value;
}

function DidYouKnowCardView({ card, onBrowse }: { card: DidYouKnowCard; onBrowse: () => void }) {
  const styles = ACCENT_STYLES[card.accent];
  const categoryImage = CATEGORY_IMAGES[card.category] ?? CATEGORY_IMAGES.Pantry;

  return (
    <button
      type="button"
      onClick={onBrowse}
      aria-label={`${card.supportingText} Explore ${card.category} deals.`}
      className={`group flex h-[10.5rem] w-full cursor-pointer flex-col rounded-3xl border px-5 py-4 text-left shadow-xs transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 ${styles.card}`}
    >
      <span className="flex h-14 w-14 shrink-0 items-center">
        <Image
          src={categoryImage}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 object-contain"
          aria-hidden="true"
        />
      </span>

      <span className="mt-1 line-clamp-2 dd-type-control text-stone-900">
        {card.supportingText}
      </span>

      <span className="mt-2 flex items-end justify-between gap-3">
        <span className="flex min-w-0 items-end gap-2">
          <span className={`dd-type-display leading-none tabular-nums ${styles.metric}`}>{formatMetric(card)}</span>
          <span className={`pb-0.5 dd-type-control font-extrabold leading-tight ${styles.detail}`}>{card.metricLabel}</span>
        </span>
        <ArrowRight className={`h-6 w-6 shrink-0 transition-transform group-active:translate-x-0.5 ${styles.detail}`} strokeWidth={2.5} aria-hidden="true" />
      </span>
    </button>
  );
}

export default function DidYouKnowCarousel({ cards, publicationKey, publicationComplete, storageScope, flushTop = false, onBrowse }: DidYouKnowCarouselProps) {
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
    <section ref={sectionRef} className={`flex flex-col gap-3 bg-white py-4 ${flushTop ? "-mt-2" : ""}`} aria-labelledby="did-you-know-title">
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
