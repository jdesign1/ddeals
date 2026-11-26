import {
  groupCategory,
  matchesAnySelectedStore,
  type CurrentDeal,
  type ProductCard,
  type RecentSpecialPriceDrop,
} from "@dodgey-deals/shared";
import { matchesDealFilter, type DealFilter } from "./deal-filters.ts";
import type { CheckDealsSortBy } from "./deal-sorting.ts";
import { getNewSpecialDealKey } from "./new-specials.ts";

export const DID_YOU_KNOW_MIN_ASSESSED_PRODUCTS = 20;
export const DID_YOU_KNOW_MIN_REAL_PRODUCTS = 10;
export const DID_YOU_KNOW_MIN_HISTORY_PRODUCTS = 10;
export const DID_YOU_KNOW_MIN_FRESH_DEALS = 8;
export const DID_YOU_KNOW_MIN_DODGY_PRODUCTS = 2;
export const DID_YOU_KNOW_MIN_NINETY_DAY_LOW_PRODUCTS = 5;
export const DID_YOU_KNOW_MIN_HISTORY_SAMPLES = 6;
export const DID_YOU_KNOW_MIN_HISTORY_DAYS = 45;
export const DID_YOU_KNOW_MIN_PRICE_DROPS = 3;
export const DID_YOU_KNOW_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAY_LOW_EPSILON = 0.01;
const PRICE_MATCH_EPSILON = 0.005;

export type DidYouKnowCardKind =
  | "real-saver-leader"
  | "ninety-day-low"
  | "historical-value"
  | "fresh-deal-wave"
  | "price-drop"
  | "dodgy-alert";

export type DidYouKnowAccent = "fair" | "neutral" | "alert";

export interface DidYouKnowSearchTarget {
  filter: DealFilter;
  category: string;
  sortBy: CheckDealsSortBy;
  dealKeys?: string[];
  preserveSelectedStores?: boolean;
}

export interface DidYouKnowCard {
  id: string;
  kind: DidYouKnowCardKind;
  category: string;
  accent: DidYouKnowAccent;
  metric: number;
  metricFormat: "count" | "percentage";
  metricLabel: string;
  supportingText: string;
  /** Changes in the underlying fact can re-surface the card's unread cue even if its count is unchanged. */
  dataFingerprint?: string;
  search: DidYouKnowSearchTarget;
}

interface HistoryEntry {
  averageDiscountPct: number;
}

interface CategoryBucket {
  category: string;
  assessedProducts: Set<string>;
  realProducts: Set<string>;
  dodgyProducts: Set<string>;
  freshDealKeys: Set<string>;
  historyEntries: HistoryEntry[];
  ninetyDayLowProducts: Set<string>;
  ninetyDayLowDealKeys: Set<string>;
  priceDropDealKeys: Set<string>;
  priceDropFingerprints: Map<string, string>;
}

function sourceDealKey(productId: string, storeId: string): string {
  return JSON.stringify([productId, storeId]);
}

export interface DidYouKnowCardsWithVerdictSummary {
  cards: DidYouKnowCard[];
  verdictSummary: {
    realSavers: number;
    dodgyDeals: number;
  };
}

function isCurrentSpecial(deal: CurrentDeal): boolean {
  return deal.isOnSpecial !== false;
}

function isAssessedDeal(deal: CurrentDeal): boolean {
  return deal.dealType === "Real Deal"
    || deal.dealType === "Fair Price"
    || deal.dealType === "Dodgy Deal";
}

function isHistoryReady(deal: CurrentDeal): boolean {
  return deal.storeHistoryReady === true
    && Number.isFinite(deal.ninetyDaySamples)
    && (deal.ninetyDaySamples ?? 0) >= DID_YOU_KNOW_MIN_HISTORY_SAMPLES
    && Number.isFinite(deal.ninetyDayDaysTracked)
    && (deal.ninetyDayDaysTracked ?? 0) >= DID_YOU_KNOW_MIN_HISTORY_DAYS;
}

function freshDeal(deal: CurrentDeal, now: number): boolean {
  const startedAt = Date.parse(deal.saleStartedAt ?? "");
  return Number.isFinite(startedAt)
    && startedAt <= now
    && startedAt >= now - DID_YOU_KNOW_FRESH_WINDOW_MS;
}

function averageDiscount(deal: CurrentDeal): number | null {
  if (!Number.isFinite(deal.ninetyDayAvg) || (deal.ninetyDayAvg ?? 0) <= 0) return null;
  const discount = (((deal.ninetyDayAvg ?? 0) - deal.price) / (deal.ninetyDayAvg ?? 1)) * 100;
  return Number.isFinite(discount) ? discount : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function createBuckets(
  products: readonly ProductCard[],
  selectedStores: readonly string[],
  now: number,
  recentPriceDrops: readonly RecentSpecialPriceDrop[],
): { buckets: CategoryBucket[]; verdictSummary: DidYouKnowCardsWithVerdictSummary["verdictSummary"] } {
  const buckets = new Map<string, CategoryBucket>();
  const storeFilters = [...selectedStores];
  const realSaverProductIds = new Set<string>();
  const dodgyDealProductIds = new Set<string>();
  const recentPriceDropsBySourceDeal = new Map<string, RecentSpecialPriceDrop>(
    recentPriceDrops.map((drop) => [sourceDealKey(drop.productId, drop.storeId), drop] as const),
  );

  for (const product of products) {
    const category = groupCategory(product.category, product.name);
    let bucket = buckets.get(category);

    let hasAssessedDeal = false;
    let hasRealDeal = false;
    let hasDodgyDeal = false;
    let hasNinetyDayLow = false;
    let bestHistoricalValue: number | null = null;
    for (const deal of product.currentDeals) {
      if (!matchesAnySelectedStore(deal.store, storeFilters)) continue;
      if (matchesDealFilter(deal, "real")) realSaverProductIds.add(product.id);
      if (matchesDealFilter(deal, "dodgy")) dodgyDealProductIds.add(product.id);
      if (!isCurrentSpecial(deal)) continue;
      const sourceProductId = deal.sourceProductId;
      const sourceStoreId = deal.sourceStoreId;
      const recentPriceDrop = sourceProductId && sourceStoreId
        ? recentPriceDropsBySourceDeal.get(sourceDealKey(sourceProductId, sourceStoreId))
        : undefined;
      const isRecentPriceDrop = recentPriceDrop !== undefined
        && Math.abs(recentPriceDrop.currentPrice - deal.price) < PRICE_MATCH_EPSILON;
      if (!isAssessedDeal(deal) && !isRecentPriceDrop) continue;
      if (!bucket) {
        bucket = {
          category,
          assessedProducts: new Set<string>(),
          realProducts: new Set<string>(),
          dodgyProducts: new Set<string>(),
          freshDealKeys: new Set<string>(),
          historyEntries: [],
          ninetyDayLowProducts: new Set<string>(),
          ninetyDayLowDealKeys: new Set<string>(),
          priceDropDealKeys: new Set<string>(),
          priceDropFingerprints: new Map<string, string>(),
        } satisfies CategoryBucket;
        buckets.set(category, bucket);
      }
      if (isRecentPriceDrop && recentPriceDrop) {
        const dealKey = getNewSpecialDealKey(product.id, deal.store);
        bucket.priceDropDealKeys.add(dealKey);
        bucket.priceDropFingerprints.set(dealKey, JSON.stringify([recentPriceDrop.currentPrice, recentPriceDrop.changedAt]));
      }
      if (!isAssessedDeal(deal)) continue;
      hasAssessedDeal = true;
      if (deal.dealType === "Real Deal") hasRealDeal = true;
      if (deal.dealType === "Dodgy Deal") hasDodgyDeal = true;
      if (freshDeal(deal, now)) bucket.freshDealKeys.add(getNewSpecialDealKey(product.id, deal.store));
      if (!isHistoryReady(deal)) continue;

      if (deal.dealType === "Real Deal") {
        const low = deal.ninetyDayLow;
        if (
          (deal.ninetyDayDaysTracked ?? 0) >= 90
          && Number.isFinite(low)
          && (low ?? 0) > 0
          && deal.price <= (low ?? 0) + NINETY_DAY_LOW_EPSILON
        ) {
          bucket.ninetyDayLowDealKeys.add(getNewSpecialDealKey(product.id, deal.store));
          hasNinetyDayLow = true;
        }

        const discount = averageDiscount(deal);
        if (discount !== null && (bestHistoricalValue === null || discount > bestHistoricalValue)) {
          bestHistoricalValue = discount;
        }
      }

    }
    if (!hasAssessedDeal || !bucket) continue;

    bucket.assessedProducts.add(product.id);
    if (hasRealDeal) bucket.realProducts.add(product.id);
    if (hasDodgyDeal) bucket.dodgyProducts.add(product.id);
    if (hasNinetyDayLow) bucket.ninetyDayLowProducts.add(product.id);

    if (bestHistoricalValue !== null) {
      bucket.historyEntries.push({ averageDiscountPct: bestHistoricalValue });
    }
  }

  return {
    buckets: [...buckets.values()],
    verdictSummary: {
      realSavers: realSaverProductIds.size,
      dodgyDeals: dodgyDealProductIds.size,
    },
  };
}

function realSaverLeader(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .filter((bucket) => (
      bucket.assessedProducts.size >= DID_YOU_KNOW_MIN_ASSESSED_PRODUCTS
      && bucket.realProducts.size >= DID_YOU_KNOW_MIN_REAL_PRODUCTS
    ))
    .sort((left, right) => (
      right.realProducts.size - left.realProducts.size
      || right.realProducts.size / right.assessedProducts.size - left.realProducts.size / left.assessedProducts.size
      || left.category.localeCompare(right.category)
    ))
    .map((bucket) => ({
      id: "real-saver-leader",
      kind: "real-saver-leader" as const,
      category: bucket.category,
      accent: "fair" as const,
      metric: bucket.realProducts.size,
      metricFormat: "count" as const,
      metricLabel: "Real Savers",
      supportingText: `${bucket.category} has the most Real Savers right now.`,
      search: { filter: "real" as const, category: bucket.category, sortBy: "biggest-saver" as const },
    }));
}

function historicalValueCards(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .map((bucket) => {
      const values = bucket.historyEntries
        .map((entry) => entry.averageDiscountPct)
        .filter((value) => value > 0);
      const medianDiscount = median(values);
      if (values.length < DID_YOU_KNOW_MIN_HISTORY_PRODUCTS || medianDiscount === null || medianDiscount < 5) return null;
      return { bucket, medianDiscount, sampleCount: values.length };
    })
    .filter((candidate): candidate is { bucket: CategoryBucket; medianDiscount: number; sampleCount: number } => candidate !== null)
    .sort((left, right) => (
      right.medianDiscount - left.medianDiscount
      || right.sampleCount - left.sampleCount
      || left.bucket.category.localeCompare(right.bucket.category)
    ))
    .map(({ bucket, medianDiscount }) => ({
      id: "historical-value",
      kind: "historical-value" as const,
      category: bucket.category,
      accent: "fair" as const,
      metric: Math.round(medianDiscount * 10) / 10,
      metricFormat: "percentage" as const,
      metricLabel: "below usual price",
      supportingText: `Specials in ${bucket.category} are below their usual price.`,
      search: { filter: "real" as const, category: bucket.category, sortBy: "biggest-saver" as const },
    }));
}

function ninetyDayLowCards(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .filter((bucket) => bucket.ninetyDayLowProducts.size >= DID_YOU_KNOW_MIN_NINETY_DAY_LOW_PRODUCTS)
    .sort((left, right) => (
      right.ninetyDayLowProducts.size - left.ninetyDayLowProducts.size
      || left.category.localeCompare(right.category)
    ))
    .map((bucket) => ({
      id: "ninety-day-low",
      kind: "ninety-day-low" as const,
      category: bucket.category,
      accent: "fair" as const,
      metric: bucket.ninetyDayLowProducts.size,
      metricFormat: "count" as const,
      metricLabel: "Real Savers",
      supportingText: `${bucket.category} has Real Savers at their lowest price in 90 days.`,
      search: {
        filter: "real" as const,
        category: bucket.category,
        sortBy: "biggest-saver" as const,
        dealKeys: [...bucket.ninetyDayLowDealKeys],
        preserveSelectedStores: true,
      },
    }));
}

function freshDealCards(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .filter((bucket) => bucket.freshDealKeys.size >= DID_YOU_KNOW_MIN_FRESH_DEALS)
    .sort((left, right) => (
      right.freshDealKeys.size - left.freshDealKeys.size
      || right.assessedProducts.size - left.assessedProducts.size
      || left.category.localeCompare(right.category)
    ))
    .map((bucket) => ({
      id: "fresh-deal-wave",
      kind: "fresh-deal-wave" as const,
      category: bucket.category,
      accent: "neutral" as const,
      metric: bucket.freshDealKeys.size,
      metricFormat: "count" as const,
      metricLabel: "new specials",
      supportingText: `${bucket.category} has the most new specials this week.`,
      search: {
        filter: "all" as const,
        category: bucket.category,
        sortBy: "latest" as const,
        dealKeys: [...bucket.freshDealKeys],
        preserveSelectedStores: true,
      },
    }));
}

function priceDropCards(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .filter((bucket) => bucket.priceDropDealKeys.size >= DID_YOU_KNOW_MIN_PRICE_DROPS)
    .sort((left, right) => (
      right.priceDropDealKeys.size - left.priceDropDealKeys.size
      || left.category.localeCompare(right.category)
    ))
    .map((bucket) => ({
      id: "price-drop",
      kind: "price-drop" as const,
      category: bucket.category,
      accent: "neutral" as const,
      metric: bucket.priceDropDealKeys.size,
      metricFormat: "count" as const,
      metricLabel: "specials",
      supportingText: `Some ${bucket.category} specials are cheaper than their last special price.`,
      dataFingerprint: JSON.stringify(
        [...bucket.priceDropFingerprints.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
      search: {
        filter: "all" as const,
        category: bucket.category,
        sortBy: "latest" as const,
        dealKeys: [...bucket.priceDropDealKeys],
        preserveSelectedStores: true,
      },
    }));
}

function dodgyAlertCards(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .filter((bucket) => (
      bucket.assessedProducts.size >= DID_YOU_KNOW_MIN_ASSESSED_PRODUCTS
      && bucket.dodgyProducts.size >= DID_YOU_KNOW_MIN_DODGY_PRODUCTS
    ))
    .sort((left, right) => (
      right.dodgyProducts.size - left.dodgyProducts.size
      || right.dodgyProducts.size / right.assessedProducts.size - left.dodgyProducts.size / left.assessedProducts.size
      || left.category.localeCompare(right.category)
    ))
    .map((bucket) => ({
      id: "dodgy-alert",
      kind: "dodgy-alert" as const,
      category: bucket.category,
      accent: "alert" as const,
      metric: bucket.dodgyProducts.size,
      metricFormat: "count" as const,
      metricLabel: bucket.dodgyProducts.size === 1 ? "Dodgy Deal" : "Dodgy Deals",
      supportingText: `Check ${bucket.category} for Dodgy Deals.`,
      search: { filter: "dodgy" as const, category: bucket.category, sortBy: "worst-dodgy" as const },
    }));
}

function buildCardsFromBuckets(
  buckets: readonly CategoryBucket[],
  maxCards: number,
): DidYouKnowCard[] {
  if (maxCards <= 0) return [];

  const candidateBuilders = [
    () => realSaverLeader(buckets),
    // Keep a qualified Dodgy discovery card ahead of secondary discovery
    // facts when both would otherwise choose the same category. A red alert
    // should not disappear merely because that category is also fresh.
    () => dodgyAlertCards(buckets),
    () => ninetyDayLowCards(buckets),
    () => priceDropCards(buckets),
    () => historicalValueCards(buckets),
    () => freshDealCards(buckets),
  ];
  const cards: DidYouKnowCard[] = [];
  const usedCategories = new Set<string>();

  for (const buildCandidates of candidateBuilders) {
    const candidates = buildCandidates();
    const next = candidates.find((candidate) => !usedCategories.has(candidate.category));
    if (!next) continue;
    cards.push(next);
    usedCategories.add(next.category);
    if (cards.length >= maxCards) break;
  }

  return cards;
}

/**
 * Builds the discovery cards and verdict counts from one deferred catalogue
 * traversal. Counts are unique product groups so the summary matches the
 * product-grouped Search results users land on. Weak/unknown evidence is
 * excluded and history cards disappear quietly when their sample gates are
 * not met; the UI never needs a "needs more history" placeholder.
 */
export function buildDidYouKnowCardsWithVerdictSummary(
  products: readonly ProductCard[],
  selectedStores: readonly string[] = ["all"],
  now = Date.now(),
  maxCards = 4,
  recentPriceDrops: readonly RecentSpecialPriceDrop[] = [],
): DidYouKnowCardsWithVerdictSummary {
  if (products.length === 0) {
    return { cards: [], verdictSummary: { realSavers: 0, dodgyDeals: 0 } };
  }

  const { buckets, verdictSummary } = createBuckets(products, selectedStores, now, recentPriceDrops);
  return {
    cards: buildCardsFromBuckets(buckets, maxCards),
    verdictSummary,
  };
}

export function buildDidYouKnowCards(
  products: readonly ProductCard[],
  selectedStores: readonly string[] = ["all"],
  now = Date.now(),
  maxCards = 4,
  recentPriceDrops: readonly RecentSpecialPriceDrop[] = [],
): DidYouKnowCard[] {
  if (products.length === 0 || maxCards <= 0) return [];
  return buildDidYouKnowCardsWithVerdictSummary(products, selectedStores, now, maxCards, recentPriceDrops).cards;
}

export function getDidYouKnowCardKey(card: DidYouKnowCard): string {
  return JSON.stringify([card.id, card.category]);
}

const didYouKnowCardFingerprintCache = new WeakMap<DidYouKnowCard, string>();

export function getDidYouKnowCardFingerprint(card: DidYouKnowCard): string {
  const cachedFingerprint = didYouKnowCardFingerprintCache.get(card);
  if (cachedFingerprint) return cachedFingerprint;

  const fingerprint = JSON.stringify([
    card.id,
    card.kind,
    card.category,
    card.metricFormat,
    card.metric,
    card.metricLabel,
    card.supportingText,
    card.dataFingerprint ?? null,
    card.search.dealKeys ? [...card.search.dealKeys].sort() : null,
  ]);
  didYouKnowCardFingerprintCache.set(card, fingerprint);
  return fingerprint;
}

export function getDidYouKnowFingerprint(cards: readonly DidYouKnowCard[]): string {
  return cards
    .map((card) => `${getDidYouKnowCardKey(card)}:${getDidYouKnowCardFingerprint(card)}`)
    .join("|");
}

export interface DidYouKnowSeenState {
  version: 2;
  publicationKey: string;
  cardFingerprints: Record<string, string>;
}

const DID_YOU_KNOW_STORAGE_PREFIX = "dodgey-deals:did-you-know-seen:v2:";

function storageKey(scope: string): string {
  return `${DID_YOU_KNOW_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

export function readDidYouKnowSeenState(scope = "device"): DidYouKnowSeenState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DidYouKnowSeenState>;
    if (
      parsed.version !== 2
      || typeof parsed.publicationKey !== "string"
      || !parsed.cardFingerprints
      || typeof parsed.cardFingerprints !== "object"
      || Array.isArray(parsed.cardFingerprints)
      || Object.values(parsed.cardFingerprints).some((fingerprint) => typeof fingerprint !== "string")
    ) return null;
    return {
      version: 2,
      publicationKey: parsed.publicationKey,
      cardFingerprints: parsed.cardFingerprints as Record<string, string>,
    };
  } catch {
    return null;
  }
}

export function writeDidYouKnowSeenState(state: DidYouKnowSeenState, scope = "device"): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function createDidYouKnowSeenState(
  cards: readonly DidYouKnowCard[],
  publicationKey: string,
): DidYouKnowSeenState {
  return {
    version: 2,
    publicationKey,
    cardFingerprints: Object.fromEntries(
      cards.map((card) => [getDidYouKnowCardKey(card), getDidYouKnowCardFingerprint(card)]),
    ),
  };
}

export function hasNewDidYouKnowCardData(
  card: DidYouKnowCard,
  seenState: DidYouKnowSeenState | null,
): boolean {
  if (!seenState) return false;
  return seenState.cardFingerprints[getDidYouKnowCardKey(card)] !== getDidYouKnowCardFingerprint(card);
}

export function markDidYouKnowCardSeen(
  seenState: DidYouKnowSeenState | null,
  card: DidYouKnowCard,
  publicationKey: string,
): DidYouKnowSeenState {
  return {
    version: 2,
    publicationKey,
    cardFingerprints: {
      ...(seenState?.cardFingerprints ?? {}),
      [getDidYouKnowCardKey(card)]: getDidYouKnowCardFingerprint(card),
    },
  };
}

export function getDidYouKnowScope(baseScope: string, selectedStores: readonly string[]): string {
  const stores = [...selectedStores].sort().join(",") || "all";
  return `${baseScope}:stores:${stores}`;
}
