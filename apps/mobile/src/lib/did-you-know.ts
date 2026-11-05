import {
  groupCategory,
  matchesAnySelectedStore,
  type CurrentDeal,
  type ProductCard,
} from "@dodgey-deals/shared";
import type { DealFilter } from "./deal-filters.ts";
import type { CheckDealsSortBy } from "./deal-sorting.ts";

export const DID_YOU_KNOW_MIN_ASSESSED_PRODUCTS = 20;
export const DID_YOU_KNOW_MIN_REAL_PRODUCTS = 10;
export const DID_YOU_KNOW_MIN_HISTORY_PRODUCTS = 10;
export const DID_YOU_KNOW_MIN_FRESH_PRODUCTS = 8;
export const DID_YOU_KNOW_MIN_DODGY_PRODUCTS = 2;
export const DID_YOU_KNOW_MIN_HISTORY_SAMPLES = 6;
export const DID_YOU_KNOW_MIN_HISTORY_DAYS = 45;
export const DID_YOU_KNOW_MIN_PRICE_CHANGES = 2;
export const DID_YOU_KNOW_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type DidYouKnowCardKind =
  | "real-saver-leader"
  | "historical-value"
  | "fresh-deal-wave"
  | "price-movement"
  | "dodgy-alert";

export type DidYouKnowAccent = "fair" | "ink" | "alert";

export interface DidYouKnowSearchTarget {
  filter: DealFilter;
  category: string;
  sortBy: CheckDealsSortBy;
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
  search: DidYouKnowSearchTarget;
}

interface HistoryEntry {
  averageDiscountPct: number;
  priceChanges: number;
}

interface CategoryBucket {
  category: string;
  assessedProducts: Set<string>;
  realProducts: Set<string>;
  dodgyProducts: Set<string>;
  freshProducts: Set<string>;
  historyEntries: HistoryEntry[];
  movementProducts: Set<string>;
  trackedHistoryProducts: Set<string>;
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

function priceChanges(deal: CurrentDeal): number | null {
  const changes = deal.ninetyDayPriceChanges;
  return Number.isFinite(changes) && (changes ?? 0) >= DID_YOU_KNOW_MIN_PRICE_CHANGES
    ? Math.round(changes ?? 0)
    : null;
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
): CategoryBucket[] {
  const buckets = new Map<string, CategoryBucket>();

  for (const product of products) {
    const category = groupCategory(product.category, product.name);
    const bucket = buckets.get(category) ?? {
      category,
      assessedProducts: new Set<string>(),
      realProducts: new Set<string>(),
      dodgyProducts: new Set<string>(),
      freshProducts: new Set<string>(),
      historyEntries: [],
      movementProducts: new Set<string>(),
      trackedHistoryProducts: new Set<string>(),
    } satisfies CategoryBucket;
    buckets.set(category, bucket);

    const deals = product.currentDeals.filter(
      (deal) => isCurrentSpecial(deal) && matchesAnySelectedStore(deal.store, [...selectedStores]),
    );
    const assessedDeals = deals.filter(isAssessedDeal);
    if (assessedDeals.length === 0) continue;

    bucket.assessedProducts.add(product.id);
    if (assessedDeals.some((deal) => deal.dealType === "Real Deal")) bucket.realProducts.add(product.id);
    if (assessedDeals.some((deal) => deal.dealType === "Dodgy Deal")) bucket.dodgyProducts.add(product.id);
    if (assessedDeals.some((deal) => freshDeal(deal, now))) bucket.freshProducts.add(product.id);

    const historyDeals = assessedDeals.filter(isHistoryReady);
    if (historyDeals.length > 0) bucket.trackedHistoryProducts.add(product.id);

    const bestHistoricalValue = historyDeals
      .filter((deal) => deal.dealType === "Real Deal")
      .map(averageDiscount)
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0];
    if (bestHistoricalValue !== undefined) {
      bucket.historyEntries.push({
        averageDiscountPct: bestHistoricalValue,
        priceChanges: 0,
      });
    }

    const bestPriceChangeCount = historyDeals
      .map(priceChanges)
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0];
    if (bestPriceChangeCount !== undefined) {
      bucket.movementProducts.add(product.id);
      const historyEntry = bucket.historyEntries.find((entry) => entry.priceChanges === 0);
      if (historyEntry) historyEntry.priceChanges = bestPriceChangeCount;
      else bucket.historyEntries.push({ averageDiscountPct: 0, priceChanges: bestPriceChangeCount });
    }
  }

  return [...buckets.values()];
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

function freshDealCards(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .filter((bucket) => bucket.freshProducts.size >= DID_YOU_KNOW_MIN_FRESH_PRODUCTS)
    .sort((left, right) => (
      right.freshProducts.size - left.freshProducts.size
      || right.assessedProducts.size - left.assessedProducts.size
      || left.category.localeCompare(right.category)
    ))
    .map((bucket) => ({
      id: "fresh-deal-wave",
      kind: "fresh-deal-wave" as const,
      category: bucket.category,
      accent: "ink" as const,
      metric: bucket.freshProducts.size,
      metricFormat: "count" as const,
      metricLabel: "new specials",
      supportingText: `${bucket.category} has the most new specials this week.`,
      search: { filter: "all" as const, category: bucket.category, sortBy: "latest" as const },
    }));
}

function priceMovementCards(buckets: readonly CategoryBucket[]): DidYouKnowCard[] {
  return buckets
    .map((bucket) => {
      const tracked = bucket.trackedHistoryProducts.size;
      const changed = bucket.movementProducts.size;
      if (tracked < DID_YOU_KNOW_MIN_HISTORY_PRODUCTS || changed === 0) return null;
      return { bucket, changed, changeRate: changed / tracked };
    })
    .filter((candidate): candidate is { bucket: CategoryBucket; changed: number; changeRate: number } => candidate !== null)
    .sort((left, right) => (
      right.changeRate - left.changeRate
      || right.changed - left.changed
      || left.bucket.category.localeCompare(right.bucket.category)
    ))
    .map(({ bucket, changed }) => ({
      id: "price-movement",
      kind: "price-movement" as const,
      category: bucket.category,
      accent: "ink" as const,
      metric: changed,
      metricFormat: "count" as const,
      metricLabel: "price changes",
      supportingText: `${bucket.category} has had the most price changes lately.`,
      search: { filter: "all" as const, category: bucket.category, sortBy: "latest" as const },
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

/**
 * Builds a small, deterministic discovery set from the already-loaded live
 * catalogue. Counts are unique product groups so the card's number matches
 * the product-grouped Search results users land on. Weak/unknown evidence is
 * excluded and history cards disappear quietly when their sample gates are
 * not met; the UI never needs a "needs more history" placeholder.
 */
export function buildDidYouKnowCards(
  products: readonly ProductCard[],
  selectedStores: readonly string[] = ["all"],
  now = Date.now(),
  maxCards = 4,
): DidYouKnowCard[] {
  if (products.length === 0 || maxCards <= 0) return [];

  const buckets = createBuckets(products, selectedStores, now);
  const candidateSets = [
    realSaverLeader(buckets),
    // Keep a qualified Dodgy discovery card ahead of secondary discovery
    // facts when both would otherwise choose the same category. A red alert
    // should not disappear merely because that category is also fresh.
    dodgyAlertCards(buckets),
    historicalValueCards(buckets),
    freshDealCards(buckets),
    priceMovementCards(buckets),
  ];
  const cards: DidYouKnowCard[] = [];
  const usedCategories = new Set<string>();

  for (const candidates of candidateSets) {
    const next = candidates.find((candidate) => !usedCategories.has(candidate.category));
    if (!next) continue;
    cards.push(next);
    usedCategories.add(next.category);
    if (cards.length >= maxCards) break;
  }

  return cards;
}

export function getDidYouKnowFingerprint(cards: readonly DidYouKnowCard[]): string {
  return cards
    .map((card) => [
      card.id,
      card.category,
      card.metricFormat,
      card.metric.toFixed(1),
    ].join(":"))
    .join("|");
}

export interface DidYouKnowSeenState {
  version: 1;
  publicationKey: string;
  fingerprint: string;
}

const DID_YOU_KNOW_STORAGE_PREFIX = "dodgey-deals:did-you-know-seen:v1:";

function storageKey(scope: string): string {
  return `${DID_YOU_KNOW_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

export function readDidYouKnowSeenState(scope = "device"): DidYouKnowSeenState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DidYouKnowSeenState>;
    if (parsed.version !== 1 || typeof parsed.publicationKey !== "string" || typeof parsed.fingerprint !== "string") return null;
    return { version: 1, publicationKey: parsed.publicationKey, fingerprint: parsed.fingerprint };
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

export function getDidYouKnowScope(baseScope: string, selectedStores: readonly string[]): string {
  const stores = [...selectedStores].sort().join(",") || "all";
  return `${baseScope}:stores:${stores}`;
}
