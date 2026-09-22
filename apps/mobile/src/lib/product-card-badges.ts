import { STORE_DISPLAY_FALLBACK, type ProductCard, normalizeStoreKey } from "@dodgey-deals/shared";

function canonicalStoreKey(store: string): string {
  const normalizedStore = normalizeStoreKey(store);
  return Object.keys(STORE_DISPLAY_FALLBACK).find((knownStore) => normalizedStore.includes(knownStore)) ?? normalizedStore;
}

/**
 * A product-level verdict is ambiguous when its active specials span multiple
 * supermarkets and those supermarkets do not share the same verdict.
 */
export function hasMixedStoreVerdicts(product: Pick<ProductCard, "currentDeals">): boolean {
  const stores = new Set<string>();
  const verdicts = new Set<string>();

  for (const deal of product.currentDeals) {
    if (deal.isOnSpecial === false) continue;
    stores.add(canonicalStoreKey(deal.store));
    verdicts.add(deal.dealType);
  }

  return stores.size > 1 && verdicts.size > 1;
}
