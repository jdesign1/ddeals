import {
  compareDealSnapshotEntries,
  getDealSnapshotAmount,
  groupCategory,
  matchesAnySelectedStore,
  normalizeStoreKey,
  type CurrentDeal,
  type ProductCard,
} from "@dodgey-deals/shared";
import type { DealCheckRow } from "@dodgey-deals/shared";
import { getNewSpecialDealKey } from "./new-specials.ts";

export const CHECK_DEALS_SUMMARY_STORES = ["newworld", "paknsave", "woolworths"] as const;

export type CheckDealsSummaryStore = (typeof CHECK_DEALS_SUMMARY_STORES)[number];

export interface CheckDealsRailItem {
  product: ProductCard;
  deal: CurrentDeal;
  checkedAt?: string;
  changeLabel?: string;
  isNew?: boolean;
}

export const MAX_FOR_YOU_CATEGORY_PRODUCTS = 10;

/**
 * Rank the current genuine specials for one of a shopper's saved categories.
 * New-to-you items are promoted inside the persistent For you rail, but the
 * rail remains useful after that new-special batch has been read.
 */
export function buildForYouCategoryDeals(
  deals: readonly Pick<CheckDealsRailItem, "product" | "deal">[],
  category: string,
  newDealKeys: readonly string[] = [],
): CheckDealsRailItem[] {
  const newKeys = new Set(newDealKeys);
  return deals
    .filter(({ product }) => groupCategory(product.category, product.name) === category)
    .map(({ product, deal }) => ({
      product,
      deal,
      isNew: newKeys.has(getNewSpecialDealKey(product.id, deal.store)),
    }))
    .sort((left, right) => {
      const newDifference = Number(right.isNew) - Number(left.isNew);
      return newDifference
        || compareDealSnapshotEntries(left, right, "savings")
        || left.product.name.localeCompare(right.product.name);
    })
    .slice(0, MAX_FOR_YOU_CATEGORY_PRODUCTS);
}

/**
 * Stable per-change key for the dismissible "Worth another look" belt.
 * Including the current observed state means a later price or assessment
 * change can surface again after the user dismisses an older reminder.
 */
export function getPreviouslyCheckedDealKey(item: Pick<CheckDealsRailItem, "product" | "deal" | "checkedAt">): string {
  return [
    item.product.id,
    normalizeStoreKey(item.deal.store),
    item.checkedAt ?? "",
    item.deal.price.toFixed(2),
    item.deal.dealType,
  ].join("::");
}

function verdictRank(deal: CurrentDeal): number {
  if (deal.dealType === "Real Deal") return 4;
  if (deal.dealType === "Fair Price") return 3;
  if (deal.dealType === "Unverified Deal") return 2;
  return 1;
}

function dealFreshness(deal: CurrentDeal): number {
  return Math.max(
    Date.parse(deal.saleStartedAt ?? ""),
    Date.parse(deal.specialsVerifiedAt ?? ""),
    Date.parse(deal.scrapedAt ?? ""),
  );
}

function snapshotKindForDeal(deal: CurrentDeal): "savings" | "dodgy" {
  return deal.dealType === "Dodgy Deal" ? "dodgy" : "savings";
}

function bestSpecialDeal(left: CurrentDeal, right: CurrentDeal): CurrentDeal {
  const activeDifference = Number(right.isOnSpecial) - Number(left.isOnSpecial);
  if (activeDifference !== 0) return activeDifference > 0 ? right : left;

  const verdictDifference = verdictRank(right) - verdictRank(left);
  if (verdictDifference !== 0) return verdictDifference > 0 ? right : left;

  const rightAmount = getDealSnapshotAmount(right, snapshotKindForDeal(right)) ?? Number.NEGATIVE_INFINITY;
  const leftAmount = getDealSnapshotAmount(left, snapshotKindForDeal(left)) ?? Number.NEGATIVE_INFINITY;
  if (rightAmount !== leftAmount) return rightAmount > leftAmount ? right : left;

  return right.price < left.price ? right : left;
}

function storeKeyForSummary(store: string): CheckDealsSummaryStore | null {
  const normalized = normalizeStoreKey(store);
  return CHECK_DEALS_SUMMARY_STORES.find((key) => normalized.includes(key)) ?? null;
}

export function buildCurrentSpecialCounts(
  products: readonly ProductCard[],
): Record<CheckDealsSummaryStore, number> {
  const productIdsByStore = new Map<CheckDealsSummaryStore, Set<string>>(
    CHECK_DEALS_SUMMARY_STORES.map((store) => [store, new Set<string>()]),
  );

  for (const product of products) {
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial) continue;
      const store = storeKeyForSummary(deal.store);
      if (store) productIdsByStore.get(store)?.add(product.id);
    }
  }

  return Object.fromEntries(
    CHECK_DEALS_SUMMARY_STORES.map((store) => [store, productIdsByStore.get(store)?.size ?? 0]),
  ) as Record<CheckDealsSummaryStore, number>;
}

export function getLatestPublishedAt(products: readonly ProductCard[]): string | null {
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  let latestPublishedAt: string | null = null;

  for (const product of products) {
    for (const deal of product.currentDeals) {
      for (const candidate of [deal.scrapedAt, deal.specialsVerifiedAt]) {
        const timestamp = Date.parse(candidate ?? "");
        if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
          latestPublishedAt = new Date(timestamp).toISOString();
        }
      }
    }
  }

  return latestPublishedAt;
}

/** Compact live-feed copy for the summary card. The screen has its own
 * accessible label, so this deliberately stays short: "12 min", not
 * "Updated 12 minutes ago". */
export function formatCompactUpdatedText(publishedAt: string | null, now = Date.now()): string | null {
  if (!publishedAt) return null;

  const publishedTimestamp = Date.parse(publishedAt);
  if (!Number.isFinite(publishedTimestamp)) return null;
  const ageMinutes = Math.max(0, Math.floor((now - publishedTimestamp) / 60_000));
  if (ageMinutes < 1) return "now";
  if (ageMinutes < 60) return `${ageMinutes} min`;

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours} hr`;

  return `${Math.floor(ageHours / 24)} days`;
}

export function buildNewSinceLastVisitDeals(
  products: readonly ProductCard[],
  dealKeys: readonly string[],
  selectedStores: readonly string[],
): CheckDealsRailItem[] {
  const newKeys = new Set(dealKeys);
  const items: CheckDealsRailItem[] = [];

  for (const product of products) {
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial || !matchesAnySelectedStore(deal.store, [...selectedStores])) continue;
      if (!newKeys.has(getNewSpecialDealKey(product.id, deal.store))) continue;
      items.push({ product, deal, isNew: true });
    }
  }

  return items
    .sort((left, right) => dealFreshness(right.deal) - dealFreshness(left.deal) || left.product.name.localeCompare(right.product.name))
    .slice(0, 20);
}

export function buildWatchlistSpecialDeals(
  products: readonly ProductCard[],
  savedProductIds: ReadonlySet<string>,
  selectedStores: readonly string[],
): CheckDealsRailItem[] {
  const items: CheckDealsRailItem[] = [];

  for (const product of products) {
    if (!savedProductIds.has(product.id)) continue;
    const candidates = product.currentDeals.filter(
      (deal) => deal.isOnSpecial && matchesAnySelectedStore(deal.store, [...selectedStores]),
    );
    if (candidates.length === 0) continue;
    const best = candidates.reduce(bestSpecialDeal);
    items.push({ product, deal: best });
  }

  return items
    .sort((left, right) => {
      const rightAmount = getDealSnapshotAmount(right.deal, snapshotKindForDeal(right.deal)) ?? 0;
      const leftAmount = getDealSnapshotAmount(left.deal, snapshotKindForDeal(left.deal)) ?? 0;
      return rightAmount - leftAmount || left.product.name.localeCompare(right.product.name);
    })
    .slice(0, 20);
}

function historyKey(row: DealCheckRow): string {
  return `${row.product_id}::${normalizeStoreKey(row.store)}`;
}

function findCurrentCheckedDeal(product: ProductCard, row: DealCheckRow, selectedStores: readonly string[]): CurrentDeal | undefined {
  const checkedStoreKey = normalizeStoreKey(row.store);
  const candidates = product.currentDeals.filter(
    (deal) => deal.isOnSpecial
      && matchesAnySelectedStore(deal.store, [...selectedStores])
      && (normalizeStoreKey(deal.store).includes(checkedStoreKey) || checkedStoreKey.includes(normalizeStoreKey(deal.store))),
  );
  return candidates.reduce<CurrentDeal | undefined>(
    (best, candidate) => (best ? bestSpecialDeal(best, candidate) : candidate),
    undefined,
  );
}

export function buildPreviouslyCheckedChangedDeals(
  products: readonly ProductCard[],
  history: readonly DealCheckRow[],
  selectedStores: readonly string[],
): CheckDealsRailItem[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const latestRows = new Map<string, DealCheckRow>();

  for (const row of [...history].sort((left, right) => Date.parse(right.checked_at) - Date.parse(left.checked_at))) {
    const key = historyKey(row);
    if (!latestRows.has(key)) latestRows.set(key, row);
  }

  const items: CheckDealsRailItem[] = [];
  for (const row of latestRows.values()) {
    const product = productById.get(row.product_id);
    if (!product) continue;
    const deal = findCurrentCheckedDeal(product, row, selectedStores);
    if (!deal) continue;

    const priceChanged = Math.abs(deal.price - row.price) > 0.005;
    const verdictChanged = deal.dealType !== row.deal_type;
    if (!priceChanged && !verdictChanged) continue;

    const changeLabel = priceChanged && verdictChanged
      ? "Price and assessment changed"
      : priceChanged
        ? "Price changed since you checked"
        : "Assessment changed since you checked";
    items.push({ product, deal, checkedAt: row.checked_at, changeLabel });
  }

  return items
    .sort((left, right) => Date.parse(right.checkedAt ?? "") - Date.parse(left.checkedAt ?? "") || left.product.name.localeCompare(right.product.name))
    .slice(0, 20);
}
