import { canonicalStoreKey, matchesAnySelectedStore, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";

export type WatchlistSortMode = "best" | "dodgy" | "recent";

export interface WatchlistSortItem {
  productId: string;
  addedAt: string;
}

function candidatesForItem(
  item: WatchlistSortItem,
  itemCards: Map<string, ProductCard>,
  selectedSupermarkets: string[],
): CurrentDeal[] {
  const deals = itemCards.get(item.productId)?.currentDeals ?? [];
  if (selectedSupermarkets.includes("all")) return [...deals];
  return deals.filter((deal) => matchesAnySelectedStore(deal.store, selectedSupermarkets));
}

function verdictRank(deal: CurrentDeal): number {
  if (deal.dealType === "Real Deal") return 4;
  if (deal.dealType === "Fair Price") return 3;
  if (deal.dealType === "Unverified Deal") return 2;
  if (deal.dealType === "Dodgy Deal" || deal.isDodgyReviewCandidate === true) return 1;
  return 0;
}

function bestDealFirst(a: CurrentDeal, b: CurrentDeal): number {
  const activeDifference = Number(b.isOnSpecial === true) - Number(a.isOnSpecial === true);
  if (activeDifference !== 0) return activeDifference;

  const verdictDifference = verdictRank(b) - verdictRank(a);
  if (verdictDifference !== 0) return verdictDifference;

  const discountDifference = (b.discountPercentage ?? 0) - (a.discountPercentage ?? 0);
  if (discountDifference !== 0) return discountDifference;

  return a.price - b.price || canonicalStoreKey(a.store).localeCompare(canonicalStoreKey(b.store));
}

function dodgyDealFirst(a: CurrentDeal, b: CurrentDeal): number {
  const activeDifference = Number(b.isOnSpecial === true) - Number(a.isOnSpecial === true);
  if (activeDifference !== 0) return activeDifference;

  const aIsDodgy = a.dealType === "Dodgy Deal" || a.isDodgyReviewCandidate === true;
  const bIsDodgy = b.dealType === "Dodgy Deal" || b.isDodgyReviewCandidate === true;
  const dodgyDifference = Number(bIsDodgy) - Number(aIsDodgy);
  if (dodgyDifference !== 0) return dodgyDifference;

  const aPriceChange = (a.price ?? 0) - (a.originalPrice ?? a.price ?? 0);
  const bPriceChange = (b.price ?? 0) - (b.originalPrice ?? b.price ?? 0);
  return bPriceChange - aPriceChange || a.price - b.price;
}

function bestCandidate(
  deals: readonly CurrentDeal[],
  compare: (a: CurrentDeal, b: CurrentDeal) => number,
): CurrentDeal | undefined {
  let best: CurrentDeal | undefined;
  for (const deal of deals) {
    if (!best || compare(deal, best) < 0) best = deal;
  }
  return best;
}

/**
 * Selects the offer that should represent a saved product in the Watchlist.
 * The default view ranks the assessment before the shelf price, so a genuine
 * Real Saver at one supermarket cannot be hidden by a cheaper Fair Price at
 * another. A pulse-selected supermarket always wins so the card reflects the
 * signal the user just selected.
 */
export function watchlistItemDeal(
  item: WatchlistSortItem,
  itemCards: Map<string, ProductCard>,
  selectedSupermarkets: string[],
  preferredStore?: string,
  sortMode: WatchlistSortMode = "best",
): CurrentDeal | undefined {
  const deals = candidatesForItem(item, itemCards, selectedSupermarkets);
  if (preferredStore) {
    const preferredDeal = deals.find((deal) => canonicalStoreKey(deal.store) === preferredStore);
    if (preferredDeal) return preferredDeal;
  }
  if (sortMode === "best") return bestCandidate(deals, bestDealFirst);
  if (sortMode === "dodgy") return bestCandidate(deals, dodgyDealFirst);
  return deals[0];
}

export function sortWatchlistItems<T extends WatchlistSortItem>(
  items: T[],
  sortMode: WatchlistSortMode,
  itemCards: Map<string, ProductCard>,
  selectedSupermarkets: string[],
  preferredStoreIds?: ReadonlyMap<string, string>,
  priorityProductIds?: ReadonlySet<string>,
): T[] {
  const rankedItems = items.map((item) => ({
    item,
    deal: watchlistItemDeal(item, itemCards, selectedSupermarkets, preferredStoreIds?.get(item.productId), sortMode),
  }));

  rankedItems.sort((aEntry, bEntry) => {
    const pulsePriorityDifference = Number(priorityProductIds?.has(bEntry.item.productId) ?? false) - Number(priorityProductIds?.has(aEntry.item.productId) ?? false);
    if (pulsePriorityDifference !== 0) return pulsePriorityDifference;

    const dealA = aEntry.deal;
    const dealB = bEntry.deal;
    const inactiveDifference = Number(dealA?.isOnSpecial !== true) - Number(dealB?.isOnSpecial !== true);
    if (inactiveDifference !== 0) return inactiveDifference;

    if (sortMode === "best") {
      const verdictDifference = (dealB ? verdictRank(dealB) : -1) - (dealA ? verdictRank(dealA) : -1);
      if (verdictDifference !== 0) return verdictDifference;
      const discountDifference = (dealB?.discountPercentage ?? 0) - (dealA?.discountPercentage ?? 0);
      if (discountDifference !== 0) return discountDifference;
      const priceDifference = (dealA?.price ?? Number.POSITIVE_INFINITY) - (dealB?.price ?? Number.POSITIVE_INFINITY);
      if (priceDifference !== 0) return priceDifference;
    } else if (sortMode === "dodgy") {
      const aIsDodgy = dealA?.dealType === "Dodgy Deal" || dealA?.isDodgyReviewCandidate === true;
      const bIsDodgy = dealB?.dealType === "Dodgy Deal" || dealB?.isDodgyReviewCandidate === true;
      const dodgyDifference = Number(bIsDodgy) - Number(aIsDodgy);
      if (dodgyDifference !== 0) return dodgyDifference;
      const priceIncreaseDifference = ((dealB?.price ?? 0) - (dealB?.originalPrice ?? dealB?.price ?? 0)) - ((dealA?.price ?? 0) - (dealA?.originalPrice ?? dealA?.price ?? 0));
      if (priceIncreaseDifference !== 0) return priceIncreaseDifference;
    }

    return new Date(bEntry.item.addedAt).getTime() - new Date(aEntry.item.addedAt).getTime();
  });

  return rankedItems.map(({ item }) => item);
}
