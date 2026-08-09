/**
 * Deal-assessment-page logic — ported from Prototype/index.html's
 * `components/DealModal.tsx` section (its "Check Deal" screen: the
 * assessment view + "Cheaper Alternatives" sub-view). Split out into pure,
 * hook-free functions (unlike the prototype's version, which computes all
 * of this inline via `React.useMemo` inside the modal component) so the
 * logic is testable on its own and reusable from a real Next.js route
 * component, per this repo's established split of data logic (packages/
 * shared) from presentation (apps/mobile/src/components).
 *
 * Ported 2026-08-09. Deliberate differences from the prototype, flagged
 * rather than silently dropped:
 *  - `storesList` here is this app's real 5-store live catalogue
 *    (STORE_DISPLAY_FALLBACK's values), not the prototype's hardcoded
 *    4-store list (Woolworths/PAK'nSAVE/New World/Four Square) -- matches
 *    the same "5th store" note already on lib/store-meta.ts.
 *  - The prototype's "cheaper alternatives" pool was `mockProducts`, a
 *    module-level `let` that despite its name gets reassigned to the real
 *    live catalogue once `loadLiveProducts()` resolves (see index.html
 *    line ~7330) -- so it's real live data there too, not literal mock
 *    data. `findCheaperAlternatives` below takes that same live product
 *    list as an explicit parameter instead of relying on a global.
 *  - The prototype's bottom "Regular/Special min/max by store" pricing
 *    table reads `product.priceHistory`, which this app's `ProductCard`
 *    type has never populated (`priceHistory: []` always -- see data.ts;
 *    price_history stopped being fetched client-side in the 2026-08-07
 *    specials-only rearchitecture). Not ported here: showing that table
 *    would mean either fabricating data or bolting on a new live
 *    price_history fetch this session wasn't scoped to build. Flagged as a
 *    follow-up in project.md rather than faked or silently dropped.
 */

import type { ProductCard, CurrentDeal } from "./data.ts";
import { normalizeStoreKey, STORE_DISPLAY_FALLBACK } from "./data.ts";

/** Real 5-store list for this app's live catalogue (see file header note). */
export const DEAL_DETAIL_STORES_LIST: string[] = Object.values(STORE_DISPLAY_FALLBACK);

/**
 * Real store names carry branch suffixes/casing that vary ("Woolworths NZ",
 * "Pak'nSave" vs "PAK'nSAVE") -- exact `d.store === store` comparisons
 * silently miss those. Normalize both sides the same way storeMatchesFilter
 * does everywhere else in this app.
 */
export function findDealForStore(deals: CurrentDeal[] | undefined, store: string): CurrentDeal | undefined {
  return (deals || []).find((d) => normalizeStoreKey(d.store).includes(normalizeStoreKey(store)));
}

/** 'Real Deal' -> 'Real Saver', 'Fair Price' -> 'Fair Deal', identity otherwise. Verbatim from the prototype. */
export const HISTORY_DEAL_TYPE: Record<string, string> = {
  "Dodgy Deal": "Dodgy Deal",
  "Real Deal": "Real Saver",
  "Fair Price": "Fair Deal",
};

export type AssessmentVerdict = "Dodgy Deal" | "Fair Deal" | "Real Saver";

/**
 * Same branch order as the prototype's DealModal: a plain (non-special) item
 * always lands as a "Fair Deal" (no discount game being played, not a 4th
 * state); otherwise HISTORY_DEAL_TYPE[deal.dealType], defaulting to "Fair
 * Deal" for anything unmapped (covers "Unverified Deal"/UNKNOWN).
 */
export function getAssessmentVerdict(deal: CurrentDeal): AssessmentVerdict {
  if (deal.isOnSpecial === false) return "Fair Deal";
  const mapped = HISTORY_DEAL_TYPE[deal.dealType];
  if (mapped === "Real Saver" || mapped === "Dodgy Deal") return mapped;
  return "Fair Deal";
}

export function getStoreProductUrl(store: string, productName: string): string {
  const encoded = encodeURIComponent(productName);
  const norm = normalizeStoreKey(store);
  if (norm.includes("woolworth")) return `https://www.woolworths.co.nz/shop/search?searchTerm=${encoded}`;
  if (norm.includes("paknsave")) return `https://www.paknsave.co.nz/shop/search?q=${encoded}`;
  if (norm.includes("newworld")) return `https://www.newworld.co.nz/shop/search?q=${encoded}`;
  if (norm.includes("foursquare")) return `https://www.foursquare.co.nz/shop/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

/** Today's real per-store price, or null if this product has no real data at that store. */
export function getRealPriceToday(product: ProductCard, store: string): number | null {
  const activeDeal = findDealForStore(product.currentDeals, store);
  return activeDeal ? activeDeal.price : null;
}

/** Real per-store baseline (classifySpecial()'s already-computed normal/regular price), or null. */
export function getRealAveragePrice(product: ProductCard, store: string): number | null {
  const activeDeal = findDealForStore(product.currentDeals, store);
  return activeDeal ? activeDeal.originalPrice : null;
}

export interface RankingItem {
  store: string;
  price: number;
}

/** Every store this product has real data at, cheapest first. */
export function buildRankingList(product: ProductCard, storesList: string[] = DEAL_DETAIL_STORES_LIST): RankingItem[] {
  return storesList
    .map((store) => ({ store, price: getRealPriceToday(product, store) }))
    .filter((item): item is RankingItem => item.price != null)
    .sort((a, b) => a.price - b.price);
}

/** Only stores with a currently-active special (used for the "Price ranking" list, which hides plain-price stores). */
export function buildVisibleRanking(product: ProductCard, rankingList: RankingItem[]): RankingItem[] {
  return rankingList.filter((item) => {
    const dealForStore = findDealForStore(product.currentDeals, item.store);
    return dealForStore && dealForStore.isOnSpecial !== false;
  });
}

export interface BarChartRow {
  name: string;
  storeName: string;
  currentPrice: number;
  averagePrice: number;
  isBestPrice: boolean;
}

const SHORT_STORE_NAMES: Record<string, string> = {
  Woolworths: "WW",
  "PAK'nSAVE": "PNS",
  "New World": "NW",
  "Four Square": "FS",
  SuperValue: "SV",
};

/** Current vs. average price per store, real data only -- skips any store with no real currentDeals entry. */
export function buildBarChartData(product: ProductCard, storesList: string[] = DEAL_DETAIL_STORES_LIST): BarChartRow[] {
  const rows = storesList
    .map((store) => {
      const current = getRealPriceToday(product, store);
      const avg = getRealAveragePrice(product, store);
      if (current == null || avg == null) return null;
      return {
        name: SHORT_STORE_NAMES[store] || store,
        storeName: store,
        currentPrice: current,
        averagePrice: avg,
      };
    })
    .filter((r): r is Omit<BarChartRow, "isBestPrice"> => r != null);
  const minCurrent = rows.length ? Math.min(...rows.map((r) => r.currentPrice)) : null;
  return rows.map((r) => ({ ...r, isBestPrice: r.currentPrice === minCurrent }));
}

/**
 * Splits into normalised whole-word tokens, e.g. for telling an exact word
 * match ("milk" in "Standard Milk") apart from an incidental substring
 * inside a longer, unrelated word. Ported verbatim from the prototype.
 */
export const tokenizeForFuzzy = (s: string | null | undefined): string[] =>
  (s || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

const CATEGORY_GROUPS: { label: string; match: RegExp }[] = [
  { label: "Fruit & veg", match: /fruit|veg/i },
  { label: "Meat & seafood", match: /meat|seafood|poultry|fish/i },
  { label: "Fridge, deli & eggs", match: /fridge|deli|eggs/i },
  { label: "Bakery", match: /bakery/i },
  { label: "Frozen & chilled", match: /frozen|chilled/i },
  { label: "Beer & wine", match: /beer|wine|cider/i },
  { label: "Drinks", match: /drink/i },
  { label: "Snacks & treats", match: /snack|treat/i },
  { label: "Pantry & grocery", match: /pantry|grocery/i },
  { label: "Health & household", match: /health|body|household|clean/i },
  { label: "Baby & toddler", match: /baby|toddler|child|school/i },
  { label: "Pet", match: /\bpet/i },
];

export function groupCategory(rawCategory: string | null | undefined): string {
  const top = (rawCategory || "").split(">")[0].trim();
  const group = CATEGORY_GROUPS.find((g) => g.match.test(top));
  return group ? group.label : top || "Other";
}

export interface CheaperAlternative {
  product: ProductCard;
  store: string;
  price: number;
  saving: number;
}

/**
 * Same-category (or, if that's empty, same-category-group) products with a
 * real active special cheaper than `dealPrice` at some store, sorted by
 * biggest saving, capped at 20 -- verbatim from the prototype's
 * `allCheaperAlternativeOptions`/`cheaperAlternatives` memos, just as plain
 * functions taking the live product list explicitly instead of reading a
 * module-level global.
 */
export function findCheaperAlternatives(
  product: ProductCard,
  allProducts: ProductCard[],
  dealPrice: number,
  selectedStores: string[] = ["all"],
  storesList: string[] = DEAL_DETAIL_STORES_LIST
): CheaperAlternative[] {
  const exactMatch = allProducts.filter((p) => p.id !== product.id && p.category === product.category && p.category);
  const categoryPool =
    exactMatch.length > 0
      ? exactMatch
      : allProducts.filter((p) => p.id !== product.id && groupCategory(p.category) === groupCategory(product.category));

  const nameTokens = new Set(tokenizeForFuzzy(product.name).filter((t) => t.length >= 4 && !/^\d/.test(t)));
  const alternativeProducts =
    nameTokens.size === 0
      ? categoryPool
      : (() => {
          const nameMatched = categoryPool.filter((p) => tokenizeForFuzzy(p.name).some((t) => nameTokens.has(t)));
          return nameMatched.length > 0 ? nameMatched : categoryPool;
        })();

  const allOptions: CheaperAlternative[] = alternativeProducts.flatMap((p) =>
    storesList
      .map((store) => {
        const activeDeal = (p.currentDeals || []).find(
          (d) => normalizeStoreKey(d.store).includes(normalizeStoreKey(store)) && d.isOnSpecial !== false
        );
        if (!activeDeal) return null;
        return { product: p, store, price: activeDeal.price, saving: dealPrice - activeDeal.price };
      })
      .filter((item): item is CheaperAlternative => item != null && item.price < dealPrice)
  );

  return allOptions
    .filter((item) => {
      if (selectedStores.includes("all")) return true;
      return selectedStores.some((selected) => normalizeStoreKey(item.store).includes(selected));
    })
    .sort((a, b) => b.saving - a.saving)
    .slice(0, 20);
}
