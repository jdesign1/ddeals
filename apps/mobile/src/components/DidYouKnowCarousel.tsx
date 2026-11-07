"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import InsightCarousel from "@/components/InsightCarousel";
import {
  createDidYouKnowSeenState,
  getDidYouKnowCardKey,
  hasNewDidYouKnowCardData,
  markDidYouKnowCardSeen,
  readDidYouKnowSeenState,
  writeDidYouKnowSeenState,
  type DidYouKnowAccent,
  type DidYouKnowCard,
} from "@/lib/did-you-know";

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

const DidYouKnowCardView = memo(function DidYouKnowCardView({ card, hasNewData, onBrowse }: { card: DidYouKnowCard; hasNewData: boolean; onBrowse: (card: DidYouKnowCard) => void }) {
  const styles = ACCENT_STYLES[card.accent];
  const categoryImage = CATEGORY_IMAGES[card.category] ?? CATEGORY_IMAGES.Pantry;

  return (
    <button
      type="button"
      onClick={() => onBrowse(card)}
      aria-label={`${hasNewData ? "New insight. " : ""}${card.supportingText} Explore ${card.category} deals.`}
      className={`group relative flex h-[11rem] w-full cursor-pointer flex-col rounded-3xl border px-5 py-4 text-left shadow-xs transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 ${styles.card}`}
    >
      {hasNewData && (
        <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-alert-600 ring-4 ring-white/80" aria-hidden="true" />
      )}
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
});

function DidYouKnowCarousel({ cards, publicationKey, publicationComplete, storageScope, flushTop = false, onBrowse }: DidYouKnowCarouselProps) {
  const [seenState, setSeenState] = useState<ReturnType<typeof readDidYouKnowSeenState>>(null);
  const [storageReady, setStorageReady] = useState(false);

  // These effects hydrate and initialise a localStorage-backed unread cue.
  // The state writes are the subscription bridge for that external store.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setStorageReady(false);
    setSeenState(readDidYouKnowSeenState(storageScope));
    setStorageReady(true);
  }, [storageScope]);

  useEffect(() => {
    if (!storageReady || !publicationComplete || !publicationKey || cards.length === 0) return;
    if (!seenState) {
      const initialState = createDidYouKnowSeenState(cards, publicationKey);
      if (writeDidYouKnowSeenState(initialState, storageScope)) setSeenState(initialState);
    }
  }, [cards, publicationComplete, publicationKey, seenState, storageReady, storageScope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const newCardKeys = useMemo(() => new Set(
    storageReady && publicationComplete && publicationKey && seenState
      ? cards.filter((card) => hasNewDidYouKnowCardData(card, seenState)).map(getDidYouKnowCardKey)
      : [],
  ), [cards, publicationComplete, publicationKey, seenState, storageReady]);
  const orderedCards = useMemo(() => {
    if (newCardKeys.size === 0) return cards;
    const unreadCards = cards.filter((card) => newCardKeys.has(getDidYouKnowCardKey(card)));
    const readCards = cards.filter((card) => !newCardKeys.has(getDidYouKnowCardKey(card)));
    return [...unreadCards, ...readCards];
  }, [cards, newCardKeys]);

  const markSeen = useCallback((card: DidYouKnowCard) => {
    if (!storageReady || !publicationComplete || !publicationKey) return;
    const nextState = markDidYouKnowCardSeen(seenState, card, publicationKey);
    if (writeDidYouKnowSeenState(nextState, storageScope)) setSeenState(nextState);
  }, [publicationComplete, publicationKey, seenState, storageReady, storageScope]);
  const handleBrowse = useCallback((card: DidYouKnowCard) => {
    markSeen(card);
    onBrowse(card);
  }, [markSeen, onBrowse]);

  if (cards.length === 0) return null;

  return (
    <section className={`flex flex-col gap-3 bg-white py-4 ${flushTop ? "-mt-2" : ""}`} aria-labelledby="did-you-know-title">
      <div className="mx-5 flex items-center gap-3">
        <h2 id="did-you-know-title" className="flex items-center gap-2 dd-type-section text-stone-900">
          Did you know?
        </h2>
      </div>
      <InsightCarousel
        ariaLabel="Did you know discovery cards"
        slideWidthClassName="w-[92%]"
        trackPaddingClassName="px-5"
      >
        {orderedCards.map((card) => (
          <DidYouKnowCardView key={`${card.id}-${card.category}`} card={card} hasNewData={newCardKeys.has(getDidYouKnowCardKey(card))} onBrowse={handleBrowse} />
        ))}
      </InsightCarousel>
    </section>
  );
}

export default memo(DidYouKnowCarousel);
