import {
  compareDealSnapshotEntries,
  getDealSnapshotAmount,
  groupCategory,
  matchesAnySelectedStore,
  normalizeStoreKey,
  STORE_PILL_ORDER,
  type CurrentDeal,
  type ProductCard,
} from "@dodgey-deals/shared";
import type { DealCheckRow } from "@dodgey-deals/shared";
import { getNewSpecialDealKey } from "./new-specials.ts";
import { matchesDealFilter, type DealFilter } from "./deal-filters.ts";

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
  return buildForYouCategoryDealsByCategory(deals, [category], newDealKeys)[0]?.deals ?? [];
}

/**
 * Group the savings rail once for the shopper's preferred categories. The
 * page usually asks for three categories, so doing the category lookup and
 * new-deal key construction once avoids rescanning the full rail per pill.
 */
export function buildForYouCategoryDealsByCategory(
  deals: readonly Pick<CheckDealsRailItem, "product" | "deal">[],
  categories: readonly string[],
  newDealKeys: readonly string[] = [],
): Array<{ category: string; deals: CheckDealsRailItem[] }> {
  if (categories.length === 0) return [];

  const newKeys = new Set(newDealKeys);
  const categorySet = new Set(categories);
  const grouped = new Map<string, CheckDealsRailItem[]>();

  for (const category of categories) grouped.set(category, []);

  for (const { product, deal } of deals) {
    const category = groupCategory(product.category, product.name);
    if (!categorySet.has(category)) continue;
    const categoryDeals = grouped.get(category);
    if (!categoryDeals) continue;

    insertForYouDeal(categoryDeals, {
      product,
      deal,
      isNew: newKeys.size > 0 && newKeys.has(getNewSpecialDealKey(product.id, deal.store)),
    });
  }

  return categories.map((category) => {
    return {
      category,
      deals: grouped.get(category) ?? [],
    };
  });
}

function compareForYouDeals(left: CheckDealsRailItem, right: CheckDealsRailItem): number {
  const newDifference = Number(right.isNew) - Number(left.isNew);
  return newDifference
    || compareDealSnapshotEntries(left, right, "savings")
    || left.product.name.localeCompare(right.product.name);
}

function insertForYouDeal(items: CheckDealsRailItem[], candidate: CheckDealsRailItem): void {
  let insertAt = 0;
  while (insertAt < items.length && compareForYouDeals(items[insertAt]!, candidate) <= 0) {
    insertAt += 1;
  }
  if (insertAt >= MAX_FOR_YOU_CATEGORY_PRODUCTS) return;

  items.splice(insertAt, 0, candidate);
  if (items.length > MAX_FOR_YOU_CATEGORY_PRODUCTS) items.pop();
}

/**
 * Stable per-change key for the dismissible "Deals you might have missed" belt.
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

const NEW_DEALS_RAIL_LIMIT = 20;

function compareNewDealFreshness(left: CheckDealsRailItem, right: CheckDealsRailItem): number {
  return dealFreshness(right.deal) - dealFreshness(left.deal)
    || left.product.name.localeCompare(right.product.name);
}

function insertFreshDeal(items: CheckDealsRailItem[], candidate: CheckDealsRailItem): void {
  let insertAt = 0;
  while (insertAt < items.length && compareNewDealFreshness(items[insertAt]!, candidate) <= 0) {
    insertAt += 1;
  }
  if (insertAt >= NEW_DEALS_RAIL_LIMIT) return;

  items.splice(insertAt, 0, candidate);
  if (items.length > NEW_DEALS_RAIL_LIMIT) items.pop();
}

function snapshotKindForDeal(deal: CurrentDeal): "savings" | "dodgy" {
  return deal.dealType === "Dodgy Deal" ? "dodgy" : "savings";
}

const WATCHLIST_RAIL_LIMIT = 20;

function compareWatchlistDeals(left: CheckDealsRailItem, right: CheckDealsRailItem): number {
  const rightAmount = getDealSnapshotAmount(right.deal, snapshotKindForDeal(right.deal)) ?? 0;
  const leftAmount = getDealSnapshotAmount(left.deal, snapshotKindForDeal(left.deal)) ?? 0;
  return rightAmount - leftAmount || left.product.name.localeCompare(right.product.name);
}

function insertWatchlistDeal(items: CheckDealsRailItem[], candidate: CheckDealsRailItem): void {
  let insertAt = 0;
  while (insertAt < items.length && compareWatchlistDeals(items[insertAt]!, candidate) <= 0) {
    insertAt += 1;
  }
  if (insertAt >= WATCHLIST_RAIL_LIMIT) return;

  items.splice(insertAt, 0, candidate);
  if (items.length > WATCHLIST_RAIL_LIMIT) items.pop();
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
  return buildCurrentSpecialSummary(products).counts;
}

export interface CurrentSpecialSummary {
  counts: Record<CheckDealsSummaryStore, number>;
  latestPublishedAt: string | null;
}

export interface HomePrimarySummary {
  currentSpecialSummary: CurrentSpecialSummary;
  availableStoreKeys: string[];
}

export interface HomeDealBrowseSummary extends HomePrimarySummary {
  deals: Array<{ product: ProductCard; deal: CurrentDeal }>;
  categoryCounts: Map<string, number>;
  availableCategories: string[];
}

interface HomeSummaryAccumulator {
  productIdsByStore: Map<CheckDealsSummaryStore, Set<string>>;
  presentStores: Set<string> | null;
  latestTimestamp: number;
  latestPublishedAt: string | null;
}

function createHomeSummaryAccumulator(includeAvailableStoreKeys: boolean): HomeSummaryAccumulator {
  return {
    productIdsByStore: new Map<CheckDealsSummaryStore, Set<string>>(
      CHECK_DEALS_SUMMARY_STORES.map((store) => [store, new Set<string>()]),
    ),
    presentStores: includeAvailableStoreKeys ? new Set<string>() : null,
    latestTimestamp: Number.NEGATIVE_INFINITY,
    latestPublishedAt: null,
  };
}

function addHomeSummaryDeal(
  accumulator: HomeSummaryAccumulator,
  product: ProductCard,
  deal: CurrentDeal,
): void {
  const normalizedStore = normalizeStoreKey(deal.store);
  accumulator.presentStores?.add(normalizedStore);

  if (deal.isOnSpecial) {
    const store = storeKeyForSummary(deal.store);
    if (store) accumulator.productIdsByStore.get(store)?.add(product.id);
  }

  const scrapedTimestamp = Date.parse(deal.scrapedAt ?? "");
  if (Number.isFinite(scrapedTimestamp) && scrapedTimestamp > accumulator.latestTimestamp) {
    accumulator.latestTimestamp = scrapedTimestamp;
    accumulator.latestPublishedAt = new Date(scrapedTimestamp).toISOString();
  }
  const verifiedTimestamp = Date.parse(deal.specialsVerifiedAt ?? "");
  if (Number.isFinite(verifiedTimestamp) && verifiedTimestamp > accumulator.latestTimestamp) {
    accumulator.latestTimestamp = verifiedTimestamp;
    accumulator.latestPublishedAt = new Date(verifiedTimestamp).toISOString();
  }
}

function finalizeHomePrimarySummary(accumulator: HomeSummaryAccumulator): HomePrimarySummary {
  return {
    currentSpecialSummary: {
      counts: Object.fromEntries(
        CHECK_DEALS_SUMMARY_STORES.map((store) => [store, accumulator.productIdsByStore.get(store)?.size ?? 0]),
      ) as Record<CheckDealsSummaryStore, number>,
      latestPublishedAt: accumulator.latestPublishedAt,
    },
    availableStoreKeys: accumulator.presentStores
      ? STORE_PILL_ORDER.filter((key) => [...accumulator.presentStores!].some((store) => store.includes(key)))
      : [],
  };
}

function buildSummaryParts(
  products: readonly ProductCard[],
  includeAvailableStoreKeys: boolean,
): HomePrimarySummary {
  const accumulator = createHomeSummaryAccumulator(includeAvailableStoreKeys);

  for (const product of products) {
    for (const deal of product.currentDeals) {
      addHomeSummaryDeal(accumulator, product, deal);
    }
  }

  return finalizeHomePrimarySummary(accumulator);
}

/**
 * Build the two immediate Home-page catalogue summaries in one traversal.
 *
 * The supermarket counts/freshness and the store-pill availability both read
 * every current deal, so keeping them together avoids a second full catalogue
 * pass during the first render. Their semantics stay deliberately separate:
 * counts only include active specials and dedupe by product, while store-pill
 * availability includes any observed current-deal store (including inactive
 * rows), matching deriveAvailableStoreKeys().
 */
export function buildHomePrimarySummary(
  products: readonly ProductCard[],
): HomePrimarySummary {
  return buildSummaryParts(products, true);
}

/**
 * Build the primary Home summary and the filtered Real Saver/Dodgy result
 * metadata in one catalogue traversal. The filtered view needs both values on
 * the same render, so keeping them together avoids a second walk over every
 * product and deal while preserving the summary's all-store semantics.
 */
export function buildHomeDealBrowseSummary(
  products: readonly ProductCard[],
  selectedStores: readonly string[],
  dealFilter: Exclude<DealFilter, "all">,
): HomeDealBrowseSummary {
  const accumulator = createHomeSummaryAccumulator(true);
  const storeFilters = [...selectedStores];
  const deals: Array<{ product: ProductCard; deal: CurrentDeal }> = [];
  const categoryCounts = new Map<string, number>();
  const availableCategories: string[] = [];

  for (const product of products) {
    let best: CurrentDeal | undefined;
    for (const deal of product.currentDeals) {
      addHomeSummaryDeal(accumulator, product, deal);
      if (!matchesAnySelectedStore(deal.store, storeFilters) || !matchesDealFilter(deal, dealFilter)) continue;
      if (!best || deal.price < best.price) best = deal;
    }
    if (!best) continue;

    deals.push({ product, deal: best });
    const category = groupCategory(product.category, product.name);
    if (!categoryCounts.has(category)) availableCategories.push(category);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  return {
    ...finalizeHomePrimarySummary(accumulator),
    deals,
    categoryCounts,
    availableCategories,
  };
}

/**
 * Build the Check Deals supermarket counts and freshness timestamp together.
 * Both values come from the same catalogue-wide traversal on the home page.
 */
export function buildCurrentSpecialSummary(
  products: readonly ProductCard[],
): CurrentSpecialSummary {
  return buildSummaryParts(products, false).currentSpecialSummary;
}

export function getLatestPublishedAt(products: readonly ProductCard[]): string | null {
  return buildCurrentSpecialSummary(products).latestPublishedAt;
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
  const storeFilters = [...selectedStores];
  const items: CheckDealsRailItem[] = [];
  let hasInvalidFreshness = false;

  for (const product of products) {
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial || !matchesAnySelectedStore(deal.store, storeFilters)) continue;
      if (!newKeys.has(getNewSpecialDealKey(product.id, deal.store))) continue;
      if (!Number.isFinite(dealFreshness(deal))) hasInvalidFreshness = true;
      insertFreshDeal(items, { product, deal, isNew: true });
    }
  }

  if (hasInvalidFreshness) {
    const allItems: CheckDealsRailItem[] = [];
    for (const product of products) {
      for (const deal of product.currentDeals) {
        if (!deal.isOnSpecial || !matchesAnySelectedStore(deal.store, storeFilters)) continue;
        if (!newKeys.has(getNewSpecialDealKey(product.id, deal.store))) continue;
        allItems.push({ product, deal, isNew: true });
      }
    }
    return allItems
      .sort(compareNewDealFreshness)
      .slice(0, NEW_DEALS_RAIL_LIMIT);
  }

  return items;
}

export function buildWatchlistSpecialDeals(
  products: readonly ProductCard[],
  savedProductIds: ReadonlySet<string>,
  selectedStores: readonly string[],
): CheckDealsRailItem[] {
  const storeFilters = [...selectedStores];
  const items: CheckDealsRailItem[] = [];

  for (const product of products) {
    if (!savedProductIds.has(product.id)) continue;
    let best: CurrentDeal | undefined;
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial || !matchesAnySelectedStore(deal.store, storeFilters)) continue;
      best = best ? bestSpecialDeal(best, deal) : deal;
    }
    if (best) insertWatchlistDeal(items, { product, deal: best });
  }

  return items;
}

function historyKey(row: DealCheckRow): string {
  return `${row.product_id}::${normalizeStoreKey(row.store)}`;
}

function findCurrentCheckedDeal(product: ProductCard, row: DealCheckRow, selectedStores: string[]): CurrentDeal | undefined {
  const checkedStoreKey = normalizeStoreKey(row.store);
  let best: CurrentDeal | undefined;
  for (const deal of product.currentDeals) {
    if (!deal.isOnSpecial || !matchesAnySelectedStore(deal.store, selectedStores)) continue;
    const dealStoreKey = normalizeStoreKey(deal.store);
    if (!dealStoreKey.includes(checkedStoreKey) && !checkedStoreKey.includes(dealStoreKey)) continue;
    best = best ? bestSpecialDeal(best, deal) : deal;
  }
  return best;
}

const CHECKED_HISTORY_RAIL_LIMIT = 20;

function compareCheckedHistoryItems(left: CheckDealsRailItem, right: CheckDealsRailItem): number {
  return Date.parse(right.checkedAt ?? "") - Date.parse(left.checkedAt ?? "")
    || left.product.name.localeCompare(right.product.name);
}

function insertCheckedHistoryItem(items: CheckDealsRailItem[], candidate: CheckDealsRailItem): void {
  let insertAt = 0;
  while (insertAt < items.length && compareCheckedHistoryItems(items[insertAt]!, candidate) <= 0) {
    insertAt += 1;
  }
  if (insertAt >= CHECKED_HISTORY_RAIL_LIMIT) return;

  items.splice(insertAt, 0, candidate);
  if (items.length > CHECKED_HISTORY_RAIL_LIMIT) items.pop();
}

export function buildPreviouslyCheckedChangedDeals(
  products: readonly ProductCard[],
  history: readonly DealCheckRow[],
  selectedStores: readonly string[],
): CheckDealsRailItem[] {
  const storeFilters = [...selectedStores];
  const productById = new Map(products.map((product) => [product.id, product]));
  const latestRows = new Map<string, DealCheckRow>();
  const latestTimestamps = new Map<string, number>();
  const latestIndices = new Map<string, number>();
  let hasInvalidHistoryTimestamp = false;

  for (let index = 0; index < history.length; index += 1) {
    const row = history[index]!;
    const timestamp = Date.parse(row.checked_at);
    if (!Number.isFinite(timestamp)) {
      hasInvalidHistoryTimestamp = true;
      break;
    }
    const key = historyKey(row);
    const previousTimestamp = latestTimestamps.get(key);
    if (previousTimestamp === undefined || timestamp > previousTimestamp) {
      latestRows.set(key, row);
      latestTimestamps.set(key, timestamp);
      latestIndices.set(key, index);
    }
  }

  if (hasInvalidHistoryTimestamp) {
    latestRows.clear();
    for (const row of [...history].sort((left, right) => Date.parse(right.checked_at) - Date.parse(left.checked_at))) {
      const key = historyKey(row);
      if (!latestRows.has(key)) latestRows.set(key, row);
    }
  } else {
    const orderedEntries = [...latestRows.entries()].sort(([leftKey, left], [rightKey, right]) => {
      const timestampDifference = Date.parse(right.checked_at) - Date.parse(left.checked_at);
      return timestampDifference || (latestIndices.get(leftKey)! - latestIndices.get(rightKey)!);
    });
    latestRows.clear();
    for (const [key, row] of orderedEntries) latestRows.set(key, row);
  }

  const items: CheckDealsRailItem[] = [];
  for (const row of latestRows.values()) {
    const product = productById.get(row.product_id);
    if (!product) continue;
    const deal = findCurrentCheckedDeal(product, row, storeFilters);
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

  if (hasInvalidHistoryTimestamp) {
    return items.sort(compareCheckedHistoryItems).slice(0, CHECKED_HISTORY_RAIL_LIMIT);
  }

  const rankedItems: CheckDealsRailItem[] = [];
  for (const item of items) insertCheckedHistoryItem(rankedItems, item);
  return rankedItems;
}
