import type { CurrentDeal, ProductCard } from "./data.ts";
import { matchesAnySelectedStore, normalizeStoreKey } from "./data.ts";

export interface PriceChangeStoreInput {
  key: string;
  store: string;
}

export interface PriceChangeStoreStats extends PriceChangeStoreInput {
  totalChanges: number;
  itemsTracked: number;
  itemsChanged: number;
  changeRatePct: number;
}

export interface MostChangedProduct {
  id: string;
  name: string;
  brand: string;
  totalChanges: number;
  storeCount: number;
}

export interface PriceChangeStats {
  stores: PriceChangeStoreStats[];
  topProducts: MostChangedProduct[];
}

const MIN_HISTORY_STATES_FOR_COMPARISON = 2;

function matchingDealForStore(product: ProductCard, storeKey: string): CurrentDeal | undefined {
  return product.currentDeals
    .filter((deal) =>
      deal.isOnSpecial !== false &&
      matchesAnySelectedStore(deal.store, [storeKey]) &&
      Number.isFinite(deal.ninetyDaySamples) &&
      (deal.ninetyDaySamples ?? 0) >= MIN_HISTORY_STATES_FOR_COMPARISON &&
      Number.isFinite(deal.ninetyDayPriceChanges)
    )
    .reduce<CurrentDeal | undefined>((best, deal) => (!best || deal.price < best.price ? deal : best), undefined);
}

/**
 * Builds comparable per-supermarket change rates and ranks current deal items
 * by distinct price transitions in the rolling 90-day history window.
 * Items without at least two recorded history states are excluded so a lone
 * observation is never presented as evidence of zero changes.
 */
export function buildPriceChangeStats(
  products: ProductCard[],
  stores: PriceChangeStoreInput[],
  topLimit = 10
): PriceChangeStats {
  const storeStats = stores.map((store): PriceChangeStoreStats => {
    let totalChanges = 0;
    let itemsTracked = 0;
    let itemsChanged = 0;

    for (const product of products) {
      const deal = matchingDealForStore(product, store.key);
      if (!deal) continue;
      const changes = Math.max(0, Math.floor(deal.ninetyDayPriceChanges ?? 0));
      itemsTracked += 1;
      totalChanges += changes;
      if (changes > 0) itemsChanged += 1;
    }

    return {
      ...store,
      totalChanges,
      itemsTracked,
      itemsChanged,
      changeRatePct: itemsTracked ? Math.round((itemsChanged / itemsTracked) * 100) : 0,
    };
  }).sort((a, b) =>
    Number(b.itemsTracked > 0) - Number(a.itemsTracked > 0) ||
    b.changeRatePct - a.changeRatePct ||
    b.itemsChanged - a.itemsChanged ||
    b.totalChanges - a.totalChanges
  );

  const topProducts = products
    .map((product): MostChangedProduct | null => {
      const byStore = new Map<string, CurrentDeal>();
      for (const deal of product.currentDeals) {
        if (
          deal.isOnSpecial === false ||
          !Number.isFinite(deal.ninetyDaySamples) ||
          (deal.ninetyDaySamples ?? 0) < MIN_HISTORY_STATES_FOR_COMPARISON ||
          !Number.isFinite(deal.ninetyDayPriceChanges)
        ) continue;
        const storeKey = normalizeStoreKey(deal.store);
        const existing = byStore.get(storeKey);
        if (!existing || deal.price < existing.price) byStore.set(storeKey, deal);
      }

      const changes = [...byStore.values()].reduce(
        (sum, deal) => sum + Math.max(0, Math.floor(deal.ninetyDayPriceChanges ?? 0)),
        0
      );
      if (changes === 0) return null;
      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        totalChanges: changes,
        storeCount: byStore.size,
      };
    })
    .filter((product): product is MostChangedProduct => product !== null)
    .sort((a, b) => b.totalChanges - a.totalChanges || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, topLimit));

  return { stores: storeStats, topProducts };
}
