import { canonicalStoreKey, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";

/**
 * The catalogue exposes current verdicts plus materialized 90-day history,
 * rather than a verdict snapshot for every historical day. The Watchlist
 * table therefore counts current active specials, while Top 3 uses the
 * historical day/swing fields without presenting them as historical verdicts.
 */
export const WATCHLIST_STATS_STORES = [
  { key: "newworld", label: "New World" },
  { key: "paknsave", label: "Pak’n Save" },
  { key: "woolworths", label: "Woolworths" },
] as const;

export type WatchlistTopMode = "most-often" | "least-often" | "price-swings";
export type PriceSwingDirection = "up" | "down";

export interface WatchlistStoreStats {
  key: string;
  store: string;
  realSavers: number;
  fairDeals: number;
  dodgyDeals: number;
}

export interface WatchlistStoreSavings {
  key: string;
  store: string;
  amount: number;
}

export interface WatchlistProductStoreStats {
  key: string;
  store: string;
  specialDays: number | null;
  priceSwing: number | null;
  priceSwingDirection: PriceSwingDirection | null;
  priceChanges: number | null;
}

export interface WatchlistTopProduct {
  product: ProductCard;
  stores: WatchlistProductStoreStats[];
  totalSpecialDays: number;
  totalPriceSwing: number;
  totalPriceChanges: number;
  hasHistory: boolean;
}

export interface WatchlistStats {
  stores: WatchlistStoreStats[];
  savings: WatchlistStoreSavings[];
  topProducts: WatchlistTopProduct[];
}

function representativeDeal(product: ProductCard, storeKey: string): CurrentDeal | undefined {
  return product.currentDeals
    .filter((deal) => canonicalStoreKey(deal.store) === storeKey)
    .sort((a, b) => Number(b.isOnSpecial === true) - Number(a.isOnSpecial === true) || a.price - b.price)[0];
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}

function specialDaysFor(deal: CurrentDeal | undefined): number | null {
  const days = finiteNonNegative(deal?.ninetyDaySpecialDays);
  return days === null ? null : Math.round(days);
}

function priceSwingFor(deal: CurrentDeal | undefined): number | null {
  if (!deal || deal.ninetyDayLow === null || deal.ninetyDayHigh === null) return null;
  const low = finiteNonNegative(deal.ninetyDayLow);
  const high = finiteNonNegative(deal.ninetyDayHigh);
  if (low === null || high === null || high < low) return null;
  return high - low;
}

/**
 * A low/high range does not contain an ordered price transition. The current
 * price versus the stored 90-day average is the clearest available direction
 * signal for the Top 3 card; equal or incomplete values deliberately stay
 * neutral rather than showing an unsupported arrow.
 */
function priceSwingDirectionFor(deal: CurrentDeal | undefined, priceSwing: number | null): PriceSwingDirection | null {
  if (priceSwing === null) return null;
  const current = finiteNonNegative(deal?.price);
  const average = finiteNonNegative(deal?.ninetyDayAvg);
  if (current === null || average === null || Math.abs(current - average) < 0.005) return null;
  return current > average ? "up" : "down";
}

function priceChangesFor(deal: CurrentDeal | undefined): number | null {
  const changes = finiteNonNegative(deal?.ninetyDayPriceChanges);
  return changes === null ? null : Math.round(changes);
}

function isActiveSpecial(deal: CurrentDeal | undefined): deal is CurrentDeal {
  return deal?.isOnSpecial === true;
}

function buildProductStats(product: ProductCard): WatchlistTopProduct {
  const stores = WATCHLIST_STATS_STORES.map(({ key, label }) => {
    const deal = representativeDeal(product, key);
    const priceSwing = priceSwingFor(deal);
    return {
      key,
      store: label,
      specialDays: specialDaysFor(deal),
      priceSwing,
      priceSwingDirection: priceSwingDirectionFor(deal, priceSwing),
      priceChanges: priceChangesFor(deal),
    };
  });

  return {
    product,
    stores,
    totalSpecialDays: stores.reduce((sum, store) => sum + (store.specialDays ?? 0), 0),
    totalPriceSwing: stores.reduce((sum, store) => sum + (store.priceSwing ?? 0), 0),
    totalPriceChanges: stores.reduce((sum, store) => sum + (store.priceChanges ?? 0), 0),
    hasHistory: stores.some((store) => store.specialDays !== null || store.priceSwing !== null || store.priceChanges !== null),
  };
}

function rankedProducts(products: ProductCard[], savedProductIds: ReadonlySet<string>, mode: WatchlistTopMode): WatchlistTopProduct[] {
  return products
    .filter((product) => savedProductIds.has(product.id))
    .map(buildProductStats)
    .filter((product) => product.hasHistory)
    .sort((a, b) => {
      if (mode === "least-often") {
        return a.totalSpecialDays - b.totalSpecialDays || a.product.name.localeCompare(b.product.name);
      }
      if (mode === "price-swings") {
        return b.totalPriceSwing - a.totalPriceSwing || b.totalPriceChanges - a.totalPriceChanges || a.product.name.localeCompare(b.product.name);
      }
      return b.totalSpecialDays - a.totalSpecialDays || a.product.name.localeCompare(b.product.name);
    })
    .slice(0, 3);
}

export function buildWatchlistStats(products: ProductCard[], savedProductIds: ReadonlySet<string>, mode: WatchlistTopMode = "most-often"): WatchlistStats {
  const watchlistProducts = products.filter((product) => savedProductIds.has(product.id));
  const stores = WATCHLIST_STATS_STORES.map(({ key, label }) => {
    let realSavers = 0;
    let fairDeals = 0;
    let dodgyDeals = 0;

    for (const product of watchlistProducts) {
      const deal = representativeDeal(product, key);
      if (!isActiveSpecial(deal)) continue;

      if (deal.dealType === "Real Deal") realSavers += 1;
      if (deal.dealType === "Fair Price") fairDeals += 1;
      if (deal.dealType === "Dodgy Deal") dodgyDeals += 1;
    }

    return { key, store: label, realSavers, fairDeals, dodgyDeals };
  });

  const savings = WATCHLIST_STATS_STORES.map(({ key, label }) => {
    const amount = watchlistProducts.reduce((sum, product) => {
      const deal = representativeDeal(product, key);
      return sum + (isActiveSpecial(deal) ? Math.max(0, deal.originalPrice - deal.price) : 0);
    }, 0);
    return { key, store: label, amount };
  });

  return {
    stores,
    savings,
    topProducts: rankedProducts(products, savedProductIds, mode),
  };
}
