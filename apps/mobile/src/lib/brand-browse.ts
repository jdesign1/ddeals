import {
  canonicalStoreKey,
  matchesAnySelectedStore,
  type ProductCard,
} from "@dodgey-deals/shared";
import { matchesDealFilter } from "./deal-filters.ts";

export interface BrandSummary {
  key: string;
  name: string;
  currentSpecialCount: number;
  realSaverCount: number;
  supermarketCount: number;
  representativeImage: string | null;
}

interface BrandAccumulator {
  key: string;
  name: string;
  productIds: Set<string>;
  realSaverProductIds: Set<string>;
  supermarketKeys: Set<string>;
  representativeImage: string | null;
}

export interface BuildBrandSummariesOptions {
  /** Keep only brands with at least one current Real Saver. */
  onlyWithRealSavers?: boolean;
  /** Keep the result small enough for the home rail. Omit for search lookup. */
  limit?: number;
}

const UNUSABLE_BRAND_KEYS = new Set(["", "unbranded", "unknown", "na", "n a"]);

/**
 * Creates one stable identity for display-normalised brand values. The
 * catalogue can contain punctuation and casing variants (for example,
 * `Pams`, `PAM'S`, and `PAM’S`) that must still resolve to one brand tile.
 */
export function normalizeBrandKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isUsableBrand(key: string): boolean {
  return !UNUSABLE_BRAND_KEYS.has(key);
}

function hasUsableImage(image: string | null | undefined): image is string {
  return Boolean(image && !image.includes("placehold.co"));
}

/**
 * Builds brand discovery counts from the current specials catalogue.
 * Products are counted once per brand even when they are on special at
 * multiple supermarkets; supermarketCount remains separate for context.
 */
export function buildBrandSummaries(
  products: readonly ProductCard[],
  selectedStores: readonly string[] = ["all"],
  options: BuildBrandSummariesOptions = {},
): BrandSummary[] {
  const byBrand = new Map<string, BrandAccumulator>();
  const selectedStoreList = [...selectedStores];

  for (const product of products) {
    const key = normalizeBrandKey(product.brand);
    if (!isUsableBrand(key)) continue;

    let hasSelectedDeal = false;
    let hasRealSaver = false;
    const selectedSupermarketKeys: string[] = [];
    for (const deal of product.currentDeals) {
      if (deal.isOnSpecial === false || !matchesAnySelectedStore(deal.store, selectedStoreList)) continue;
      hasSelectedDeal = true;
      const supermarketKey = canonicalStoreKey(deal.store);
      if (supermarketKey) selectedSupermarketKeys.push(supermarketKey);
      if (matchesDealFilter(deal, "real")) hasRealSaver = true;
    }
    if (!hasSelectedDeal) continue;

    let accumulator = byBrand.get(key);
    if (!accumulator) {
      accumulator = {
        key,
        name: product.brand.trim(),
        productIds: new Set<string>(),
        realSaverProductIds: new Set<string>(),
        supermarketKeys: new Set<string>(),
        representativeImage: null,
      };
      byBrand.set(key, accumulator);
    }

    accumulator.productIds.add(product.id);
    for (const supermarketKey of selectedSupermarketKeys) accumulator.supermarketKeys.add(supermarketKey);
    if (hasRealSaver) accumulator.realSaverProductIds.add(product.id);
    if (!accumulator.representativeImage && hasUsableImage(product.image)) {
      accumulator.representativeImage = product.image;
    }
  }

  const summaries = [...byBrand.values()]
    .map<BrandSummary>((brand) => ({
      key: brand.key,
      name: brand.name,
      currentSpecialCount: brand.productIds.size,
      realSaverCount: brand.realSaverProductIds.size,
      supermarketCount: brand.supermarketKeys.size,
      representativeImage: brand.representativeImage,
    }))
    .filter((brand) => !options.onlyWithRealSavers || brand.realSaverCount > 0)
    .sort((a, b) => (
      b.realSaverCount - a.realSaverCount
      || b.currentSpecialCount - a.currentSpecialCount
      || a.name.localeCompare(b.name)
    ));

  return options.limit == null ? summaries : summaries.slice(0, Math.max(0, options.limit));
}

export function brandMatchesProduct(product: ProductCard, brandKey: string | null): boolean {
  return brandKey !== null && normalizeBrandKey(product.brand) === brandKey;
}

export function findBrandByKey(brands: readonly BrandSummary[], brandKey: string | null): BrandSummary | null {
  if (!brandKey) return null;
  return brands.find((brand) => brand.key === brandKey) ?? null;
}

/**
 * Finds a brand mentioned as a complete, contiguous token sequence in a
 * longer query such as `Anchor milk`. Exact brand-only queries intentionally
 * return null: the normal product results are already the clearest response,
 * while the tile is useful for escaping unrelated matches in a mixed query.
 */
export function findBrandSuggestion(query: string, brands: readonly BrandSummary[]): BrandSummary | null {
  const queryTokens = normalizeBrandKey(query).split(" ").filter(Boolean);
  if (queryTokens.length < 2) return null;

  const matches = brands.filter((brand) => {
    const brandTokens = brand.key.split(" ").filter(Boolean);
    if (brandTokens.length === 0 || brandTokens.length >= queryTokens.length) return false;
    for (let start = 0; start <= queryTokens.length - brandTokens.length; start += 1) {
      if (brandTokens.every((token, index) => queryTokens[start + index] === token)) return true;
    }
    return false;
  });

  matches.sort((a, b) => (
    b.key.split(" ").length - a.key.split(" ").length
    || b.realSaverCount - a.realSaverCount
    || b.currentSpecialCount - a.currentSpecialCount
    || a.name.localeCompare(b.name)
  ));
  return matches[0] ?? null;
}
