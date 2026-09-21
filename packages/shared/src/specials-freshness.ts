import type { ProductCard } from "./data.ts";

export const SPECIALS_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

/** Remove store deals whose complete snapshot is missing or outside its verified window. */
export function filterRecentlyVerifiedSpecials(
  products: ProductCard[],
  now = Date.now()
): ProductCard[] {
  return products.flatMap((product) => {
    const currentDeals = product.currentDeals.filter((deal) => {
      if (!deal.specialsVerifiedAt) return false;
      const verifiedAt = Date.parse(deal.specialsVerifiedAt);
      return Number.isFinite(verifiedAt)
        && verifiedAt <= now + 5 * 60 * 1000
        && now - verifiedAt < SPECIALS_VERIFICATION_TTL_MS;
    });

    if (currentDeals.length === 0) return [];
    if (currentDeals.length === product.currentDeals.length) return [product];

    const regularPrices = currentDeals
      .map((deal) => deal.originalPrice)
      .filter((price) => Number.isFinite(price));
    return [{
      ...product,
      currentDeals,
      ...(regularPrices.length ? { standardPrice: Math.min(...regularPrices) } : {}),
    }];
  });
}
