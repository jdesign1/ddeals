import { normalizeStoreKey, type CurrentDeal, type ProductCard } from "@dodgey-deals/shared";

export interface CatalogueBaseline {
  publication: number;
  specialKeys: string[];
}

/** A stable identity for one active chain-wide special in one catalogue. */
export function getActiveSpecialKey(productId: string, deal: CurrentDeal): string | null {
  if (!deal.isOnSpecial) return null;
  const priceInCents = Number.isFinite(deal.price) ? Math.round(deal.price * 100) : "unknown";
  return JSON.stringify([
    productId,
    normalizeStoreKey(deal.store),
    deal.saleStartedAt ?? "unknown-start",
    priceInCents,
  ]);
}

export function getActiveSpecialKeys(products: readonly ProductCard[]): string[] {
  const keys = new Set<string>();
  for (const product of products) {
    for (const deal of product.currentDeals) {
      const key = getActiveSpecialKey(product.id, deal);
      if (key) keys.add(key);
    }
  }
  return [...keys].sort();
}

export function isNewToCatalogueBaseline(
  productId: string,
  deal: CurrentDeal,
  baselineKeys: ReadonlySet<string> | null
): boolean {
  if (baselineKeys === null) return false;
  const key = getActiveSpecialKey(productId, deal);
  return key !== null && !baselineKeys.has(key);
}
