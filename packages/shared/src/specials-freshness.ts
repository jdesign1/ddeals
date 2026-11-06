import type { ProductCard } from "./data.ts";

// Keep this aligned with public.verify_catalogue_publication()'s bounded
// seven-day grace period. A single failed retailer scrape must not make that
// retailer disappear from an otherwise usable cached catalogue after 48h.
export const SPECIALS_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Remove store deals whose complete snapshot is missing or outside its verified window. */
export function filterRecentlyVerifiedSpecials(
  products: ProductCard[],
  now = Date.now()
): ProductCard[] {
  let changed = false;
  const filteredProducts: ProductCard[] = [];

  for (const product of products) {
    const currentDeals = product.currentDeals.filter((deal) => {
      if (!deal.specialsVerifiedAt) return false;
      const verifiedAt = Date.parse(deal.specialsVerifiedAt);
      return Number.isFinite(verifiedAt)
        && verifiedAt <= now + 5 * 60 * 1000
        && now - verifiedAt < SPECIALS_VERIFICATION_TTL_MS;
    });

    if (currentDeals.length === 0) {
      changed = true;
      continue;
    }
    if (currentDeals.length === product.currentDeals.length) {
      filteredProducts.push(product);
      continue;
    }

    const regularPrices = currentDeals
      .map((deal) => deal.originalPrice)
      .filter((price) => Number.isFinite(price));
    changed = true;
    filteredProducts.push({
      ...product,
      currentDeals,
      ...(regularPrices.length ? { standardPrice: Math.min(...regularPrices) } : {}),
    });
  }

  // Most minute-by-minute checks do not expire anything. Keep the existing
  // reference in that case so catalogue consumers do not all re-render.
  return changed ? filteredProducts : products;
}
