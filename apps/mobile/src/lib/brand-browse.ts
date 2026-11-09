import {
  canonicalStoreKey,
  matchesAnySelectedStore,
  type ProductCard,
} from "@dodgey-deals/shared";
import { matchesDealFilter } from "./deal-filters.ts";
import { getNewSpecialDealKey } from "./new-specials.ts";

export interface BrandSummary {
  key: string;
  name: string;
  currentSpecialCount: number;
  realSaverCount: number;
  supermarketCount: number;
  representativeImage: string | null;
  unreadRealSaverDealKeys: string[];
}

interface BrandAccumulator {
  key: string;
  name: string;
  productIds: Set<string>;
  realSaverProductIds: Set<string>;
  supermarketKeys: Set<string>;
  representativeImage: string | null;
  unreadRealSaverDealKeys: Set<string>;
}

export interface BuildBrandSummariesOptions {
  /** Keep only brands with at least one current Real Saver. */
  onlyWithRealSavers?: boolean;
  /** Keep the result small enough for the home rail. Omit for search lookup. */
  limit?: number;
  /** Current unread Real Saver deal keys used to show the brand-card cue. */
  unreadRealSaverDealKeys?: ReadonlySet<string>;
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

/**
 * Keeps apostrophe-s brand names readable after catalogue title-casing.
 * For example, `Griffin'S` should be shown as `Griffins`, not with a
 * capitalised possessive suffix.
 */
export function normalizeBrandDisplayName(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/['’]s\b/gi, "s");
}

function isUsableBrand(key: string): boolean {
  return !UNUSABLE_BRAND_KEYS.has(key);
}

function hasUsableImage(image: string | null | undefined): image is string {
  return Boolean(image && !image.includes("placehold.co"));
}

function compareBrandSummaries(left: BrandSummary, right: BrandSummary): number {
  return right.realSaverCount - left.realSaverCount
    || right.currentSpecialCount - left.currentSpecialCount
    || left.name.localeCompare(right.name);
}

function takeTopBrandSummaries(summaries: BrandSummary[], limit: number): BrandSummary[] {
  if (limit <= 0) return [];
  const top: BrandSummary[] = [];
  for (const summary of summaries) {
    let insertAt = 0;
    while (insertAt < top.length && compareBrandSummaries(top[insertAt]!, summary) <= 0) insertAt += 1;
    if (insertAt >= limit) continue;
    top.splice(insertAt, 0, summary);
    if (top.length > limit) top.pop();
  }
  return top;
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
  const unreadRealSaverDealKeySet = options.unreadRealSaverDealKeys;

  for (const product of products) {
    const key = normalizeBrandKey(product.brand);
    if (!isUsableBrand(key)) continue;

    let hasSelectedDeal = false;
    let hasRealSaver = false;
    let unreadRealSaverDealKeys: string[] | null = null;
    let selectedSupermarketKeys: string[] | null = null;
    for (const deal of product.currentDeals) {
      if (deal.isOnSpecial === false || !matchesAnySelectedStore(deal.store, selectedStoreList)) continue;
      hasSelectedDeal = true;
      const supermarketKey = canonicalStoreKey(deal.store);
      if (supermarketKey) (selectedSupermarketKeys ??= []).push(supermarketKey);
      if (matchesDealFilter(deal, "real")) {
        hasRealSaver = true;
        if (unreadRealSaverDealKeySet) {
          const dealKey = getNewSpecialDealKey(product.id, deal.store);
          if (unreadRealSaverDealKeySet.has(dealKey)) (unreadRealSaverDealKeys ??= []).push(dealKey);
        }
      }
    }
    if (!hasSelectedDeal) continue;

    let accumulator = byBrand.get(key);
    if (!accumulator) {
      accumulator = {
        key,
        name: normalizeBrandDisplayName(product.brand),
        productIds: new Set<string>(),
        realSaverProductIds: new Set<string>(),
        supermarketKeys: new Set<string>(),
        representativeImage: null,
        unreadRealSaverDealKeys: new Set<string>(),
      };
      byBrand.set(key, accumulator);
    }

    accumulator.productIds.add(product.id);
    if (selectedSupermarketKeys) {
      for (const supermarketKey of selectedSupermarketKeys) accumulator.supermarketKeys.add(supermarketKey);
    }
    if (hasRealSaver) accumulator.realSaverProductIds.add(product.id);
    if (unreadRealSaverDealKeys) {
      for (const dealKey of unreadRealSaverDealKeys) accumulator.unreadRealSaverDealKeys.add(dealKey);
    }
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
      unreadRealSaverDealKeys: [...brand.unreadRealSaverDealKeys],
    }))
    .filter((brand) => !options.onlyWithRealSavers || brand.realSaverCount > 0);

  if (options.limit == null) return summaries.sort(compareBrandSummaries);
  const limit = Math.max(0, Math.floor(options.limit));
  if (!Number.isFinite(limit)) return limit === Infinity ? summaries.sort(compareBrandSummaries) : [];
  return takeTopBrandSummaries(summaries, limit);
}

export function brandMatchesProduct(product: ProductCard, brandKey: string | null): boolean {
  return brandKey !== null && normalizeBrandKey(product.brand) === brandKey;
}

export function findBrandByKey(brands: readonly BrandSummary[], brandKey: string | null): BrandSummary | null {
  if (!brandKey) return null;
  return brands.find((brand) => brand.key === brandKey) ?? null;
}

/**
 * Finds a brand named by a complete, contiguous token sequence in the query.
 * This includes exact brand-only queries such as `Nivea`, so users can jump
 * from the normal search results to every current product for that brand.
 */
export function findBrandSuggestion(query: string, brands: readonly BrandSummary[]): BrandSummary | null {
  const queryTokens = normalizeBrandKey(query).split(" ").filter(Boolean);
  if (queryTokens.length === 0) return null;

  let bestMatch: BrandSummary | null = null;
  let bestTokenCount = 0;
  for (const brand of brands) {
    const brandTokens = brand.key ? brand.key.split(" ") : [];
    if (brandTokens.length === 0 || brandTokens.length > queryTokens.length) continue;

    let isMatch = false;
    for (let start = 0; start <= queryTokens.length - brandTokens.length; start += 1) {
      if (brandTokens.every((token, index) => queryTokens[start + index] === token)) {
        isMatch = true;
        break;
      }
    }
    if (!isMatch) continue;
    const brandTokenCount = brandTokens.length;

    // An exact match cannot be outranked by a shorter brand match, so avoid
    // scanning and comparing the rest of the summaries for common brand-only
    // searches such as `Nivea`.
    if (brandTokenCount === queryTokens.length) return brand;

    if (!bestMatch) {
      bestMatch = brand;
      bestTokenCount = brandTokenCount;
      continue;
    }

    if (
      brandTokenCount > bestTokenCount
      || brandTokenCount === bestTokenCount && (
        brand.realSaverCount > bestMatch.realSaverCount
        || brand.realSaverCount === bestMatch.realSaverCount
          && (
            brand.currentSpecialCount > bestMatch.currentSpecialCount
            || brand.currentSpecialCount === bestMatch.currentSpecialCount
              && brand.name.localeCompare(bestMatch.name) < 0
          )
      )
    ) {
      bestMatch = brand;
      bestTokenCount = brandTokenCount;
    }
  }

  return bestMatch;
}
