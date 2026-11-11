import type { ProductCard } from "./data.ts";

// Keep this aligned with public.verify_catalogue_publication()'s bounded
// seven-day grace period. A single failed retailer scrape must not make that
// retailer disappear from an otherwise usable cached catalogue after 48h.
export const SPECIALS_VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CurrentSpecialObservation {
  price: number | null | undefined;
  is_special: boolean | null | undefined;
}

export interface PublishedSpecialObservation {
  sale_price?: number | null;
  specials_verified_at?: string | null;
}

const CORE_SUPERMARKETS = ["newworld", "paknsave", "woolworths"] as const;

function normalizedStoreId(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Returns core retailers that the publication marker says were verified but
 * whose offers are missing from this snapshot. They normally have active
 * specials; a marker/snapshot mismatch is safer to treat as incomplete than
 * to show shoppers a false zero for a supermarket.
 */
export function missingVerifiedCoreSupermarketIds(
  products: readonly { currentDeals: readonly { store: string }[] }[],
  verifiedStoreIds: readonly string[] | null | undefined,
): string[] {
  if (!verifiedStoreIds) return [];
  const verified = verifiedStoreIds.map(normalizedStoreId);
  const present = new Set(products.flatMap((product) => product.currentDeals.map((deal) => normalizedStoreId(deal.store))));

  return CORE_SUPERMARKETS.filter((storeId) => {
    const isVerified = verified.some((verifiedId) => verifiedId.includes(storeId));
    const hasOffers = [...present].some((storeKey) => storeKey.includes(storeId));
    return isVerified && !hasOffers;
  });
}

/**
 * A raw current-price flag is only an observation. It becomes a user-facing
 * live special when the same product/store also has a published assessment,
 * the sale price still matches, and the retailer snapshot is inside the
 * catalogue freshness window.
 *
 * `specials_verified_at` is optional for pure unit-test callers and older
 * cached rows. Live catalogue rows include it, so production reads receive
 * the bounded freshness check.
 */
export function isVerifiedLiveSpecial(
  price: CurrentSpecialObservation,
  published: PublishedSpecialObservation | null | undefined,
  now = Date.now(),
): boolean {
  if (price.is_special !== true || !published) return false;

  const currentPrice = Number(price.price);
  if (!Number.isFinite(currentPrice) || currentPrice < 0) return false;

  if (published.sale_price != null) {
    const salePrice = Number(published.sale_price);
    if (!Number.isFinite(salePrice) || Math.round(salePrice * 100) !== Math.round(currentPrice * 100)) return false;
  }

  if (published.specials_verified_at) {
    const verifiedAt = Date.parse(published.specials_verified_at);
    if (!Number.isFinite(verifiedAt)) return false;
    if (verifiedAt > now + 5 * 60 * 1000 || now - verifiedAt >= SPECIALS_VERIFICATION_TTL_MS) return false;
  }

  return true;
}

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
