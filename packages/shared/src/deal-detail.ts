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
 *    follow-up in project.md -- NOW BUILT, 2026-08-19, see
 *    `buildPriceHistoryInsights` at the bottom of this file. Took the
 *    "extend the view with pre-aggregated columns" path rather than a new
 *    per-deal-page price_history fetch (Jay's call when asked) -- riding
 *    the existing dodgy_deals_cache fetch, zero new network requests, same
 *    reasoning as every other egress-conscious choice already made in this
 *    codebase (data.ts's own header comment).
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

/** Maps the catalogue's internal deal labels to the language used on the assessment page. */
export const HISTORY_DEAL_TYPE: Record<string, string> = {
  "Dodgy Deal": "Dodgy Deal",
  "Real Deal": "Real Saver",
  "Fair Price": "Fair Deal",
  "Unverified Deal": "Still checking",
};

export type AssessmentVerdict = "Dodgy Deal" | "Fair Deal" | "Real Saver" | "Still checking";

/**
 * Same branch order as the prototype's DealModal: a plain (non-special) item
 * always lands as a "Fair Deal" (no discount game being played); a special
 * without enough evidence stays in the neutral "Still checking" state.
 */
export function getAssessmentVerdict(deal: CurrentDeal): AssessmentVerdict {
  if (deal.isOnSpecial === false) return "Fair Deal";
  const mapped = HISTORY_DEAL_TYPE[deal.dealType];
  if (mapped === "Real Saver" || mapped === "Dodgy Deal" || mapped === "Fair Deal" || mapped === "Still checking") {
    return mapped;
  }
  return "Still checking";
}

export function getStoreProductUrl(store: string, productName: string): string {
  const encoded = encodeURIComponent(productName);
  const norm = normalizeStoreKey(store);
  // Woolworths NZ's live search page is `/shop/searchproducts?search=...`.
  // `/shop/search/products?searchTerm=...` is a 404 on the current site.
  if (norm.includes("woolworth")) return `https://www.woolworths.co.nz/shop/searchproducts?search=${encoded}`;
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

/**
 * Product-type guardrails for the cheaper-options carousel. The catalogue's
 * category field is often only a broad department (especially Woolworths),
 * so a department match by itself is not enough to call two products useful
 * alternatives. These are deliberately high-confidence types: an unknown
 * type can still match through meaningful product words, but two known,
 * different types are never treated as alternatives.
 */
const PRODUCT_TYPE_PATTERNS: { key: string; patterns: string[] }[] = [
  { key: "bakeware", patterns: ["springform", "cake pan", "cake tin", "baking pan", "baking tray", "baking tin", "bakeware"] },
  { key: "dishwashing", patterns: ["dishwashing", "dish wash", "dish liquid", "dish soap"] },
  { key: "soap", patterns: ["hand wash", "hand soap", "body wash", "bar soap", "soap"] },
  { key: "toilet_paper", patterns: ["toilet paper", "toilet tissue", "toilet roll"] },
  { key: "paper_towel", patterns: ["paper towel", "kitchen towel"] },
  { key: "facial_tissue", patterns: ["facial tissue", "tissue"] },
  { key: "rubbish_bag", patterns: ["rubbish bag", "bin liner", "bin bag", "kitchen tidy", "trash bag"] },
  { key: "air_freshener", patterns: ["air freshener", "airfreshener", "odour fighter"] },
  { key: "razor", patterns: ["razor", "shaver"] },
  { key: "food_storage", patterns: ["cling wrap", "plastic wrap", "food wrap", "storage container", "food container"] },
  { key: "paper_cup", patterns: ["paper cup", "party cup"] },
  { key: "dog_food", patterns: ["dog food", "dog roll", "dog treat", "puppy"] },
  { key: "cat_food", patterns: ["cat food", "cat treat", "kitten"] },
];

const ALTERNATIVE_STOP_TOKENS = new Set([
  "and", "with", "for", "the", "from", "size", "pack", "pk", "each", "per", "range",
  "large", "medium", "small", "regular", "original", "assorted", "formula", "based",
  "plant", "non", "stick", "new", "nz", "cm", "mm", "ml", "litre", "litres", "l",
  "g", "kg", "oz", "x",
]);

function normaliseCategory(value: string | null | undefined): string {
  return (value || "")
    .split(">")
    .map((part) => tokenizeForFuzzy(part).join(" "))
    .filter(Boolean)
    .join(" > ");
}

function singularAlternativeToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function meaningfulNameTokens(name: string | null | undefined): Set<string> {
  return new Set(
    tokenizeForFuzzy(name)
      .filter((token) => token.length >= 3 && !/^\d/.test(token) && !ALTERNATIVE_STOP_TOKENS.has(token))
      .map(singularAlternativeToken)
  );
}

function productTypeKey(product: ProductCard): string | null {
  const text = tokenizeForFuzzy(product.name).join(" ");
  return PRODUCT_TYPE_PATTERNS.find(({ patterns }) => patterns.some((pattern) => text.includes(pattern)))?.key || null;
}

/**
 * Returns a relevance score, or 0 when the candidate should be excluded.
 * Shared broad categories are only a starting pool; a meaningful name/type
 * relationship is required before price can make a product visible.
 */
function cheaperAlternativeRelevance(target: ProductCard, candidate: ProductCard): number {
  const sameGroup = groupCategory(target.category) === groupCategory(candidate.category);
  if (!sameGroup) return 0;

  const targetCategory = normaliseCategory(target.category);
  const candidateCategory = normaliseCategory(candidate.category);
  const sameCategory = Boolean(targetCategory && targetCategory === candidateCategory);
  const targetType = productTypeKey(target);
  const candidateType = productTypeKey(candidate);
  if (targetType && candidateType && targetType !== candidateType) return 0;

  const targetTokens = meaningfulNameTokens(target.name);
  const candidateTokens = meaningfulNameTokens(candidate.name);
  const sharedTokens = [...targetTokens].filter((token) => candidateTokens.has(token));
  const sameType = Boolean(targetType && targetType === candidateType);

  // This is the important safety rule: when the category is broad and there
  // are no shared product words or known product type, the item is random,
  // regardless of how much cheaper it is.
  if (!sameType && sharedTokens.length === 0) return 0;

  // A cross-category-group match needs stronger evidence than two products
  // that already share the exact catalogue category.
  if (!sameCategory && !sameType && sharedTokens.length < 2) return 0;

  return (sameType ? 4 : 0) + (sameCategory ? 1 : 0) + sharedTokens.length * 0.5;
}

/**
 * Category-picker section groupings for the "Categories" filter sheet --
 * promoted here 2026-08-21 (was a local const in `FullScreenSearch.tsx`)
 * once Home's own Trending tab needed the exact same section/category list
 * for its own new Categories filter, per Jay: "Add the categories sort
 * button (existing from the full search screen) to the trending tab." Same
 * "promote to shared the moment a SECOND screen needs the identical list"
 * convention this file/`data.ts` already follow (`matchesAnySelectedStore`,
 * `deriveAvailableStoreKeys`, `STORE_PILL_ORDER`, etc) -- avoids a second
 * copy quietly drifting from this one rather than a deliberate choice not
 * to share it. Every category name here must match one of `CATEGORY_GROUPS`'s
 * own `label` values above -- this is the UI's own curated section/ordering
 * layer on TOP of that classification, not a second source of truth for
 * what the categories themselves are (deliberately excludes "Other", the
 * `groupCategory` fallback for anything unmatched -- there's no natural
 * section for it, same as the original `FullScreenSearch.tsx` version).
 */
export const CATEGORY_SECTIONS: { title: string; categories: string[] }[] = [
  { title: "Fresh", categories: ["Fruit & veg", "Meat & seafood", "Fridge, deli & eggs", "Bakery", "Frozen & chilled"] },
  { title: "Grocery & drinks", categories: ["Pantry & grocery", "Drinks", "Beer & wine", "Snacks & treats"] },
  { title: "Household & care", categories: ["Health & household", "Baby & toddler", "Pet"] },
];

export interface CheaperAlternative {
  product: ProductCard;
  store: string;
  price: number;
  saving: number;
}

type RankedCheaperAlternative = CheaperAlternative & { relevance: number };

/**
 * Relevant products with a real active special cheaper than `dealPrice` at
 * some store. Broad categories form the candidate pool, but every result must
 * also have meaningful product-word or product-type evidence. Relevance is
 * ranked before saving so a large price difference cannot promote an
 * unrelated item. The list is capped at 20.
 */
export function findCheaperAlternatives(
  product: ProductCard,
  allProducts: ProductCard[],
  dealPrice: number,
  selectedStores: string[] = ["all"],
  storesList: string[] = DEAL_DETAIL_STORES_LIST
): CheaperAlternative[] {
  const categoryPool = allProducts.filter(
    (p) => p.id !== product.id && groupCategory(p.category) === groupCategory(product.category)
  );

  const allOptions = categoryPool.flatMap((p) =>
    storesList
      .map((store) => {
        const activeDeal = (p.currentDeals || []).find(
          (d) => normalizeStoreKey(d.store).includes(normalizeStoreKey(store)) && d.isOnSpecial !== false
        );
        if (!activeDeal) return null;
        const relevance = cheaperAlternativeRelevance(product, p);
        if (!relevance) return null;
        return { product: p, store, price: activeDeal.price, saving: dealPrice - activeDeal.price, relevance };
      })
      .filter((item): item is RankedCheaperAlternative => item != null && item.price < dealPrice)
  );

  return allOptions
    .filter((item) => {
      if (selectedStores.includes("all")) return true;
      return selectedStores.some((selected) => normalizeStoreKey(item.store).includes(selected));
    })
    .sort((a, b) => b.relevance - a.relevance || b.saving - a.saving)
    .slice(0, 20)
    .map(({ relevance: _relevance, ...item }) => item);
}

/**
 * Price History Insights carousel (spec "Main Flow: Check Deals" doc, step
 * 4: "three to five insights based on the product's price history over the
 * previous 90 days"). Backed by `dodgy_deals`'s `history_90d` CTE (see
 * migrations/20260819_dodgy_deals_price_history_insights.sql, duration-
 * weighted 2026-08-20 via migrations/20260820_dodgy_deals_time_weighted_
 * history.sql) via the `ninetyDay*` fields on `CurrentDeal` -- real
 * server-computed stats, not derived from `ProductCard.priceHistory`
 * (still always `[]`, see this file's header comment and data.ts).
 *
 * Gated on `ninetyDaySamples` (event-count confidence floor, see
 * MIN_90D_SAMPLES_FOR_INSIGHTS below) AND on the duration-weighted
 * `ninetyDayDaysTracked`/`ninetyDaySpecialDays` the frequency card needs.
 * By construction in the SQL these travel together (all present or all
 * absent), but this function still null-checks each individually rather
 * than trusting that invariant blindly -- same standing caution as before,
 * now with an extra real-world case: until migrations/20260820_dodgy_
 * deals_time_weighted_history.sql is live AND data.ts's `select=` picks up
 * the two new columns (deliberately NOT done yet -- see data.ts's own
 * 2026-08-20 comment), `ninetyDayDaysTracked`/`ninetyDaySpecialDays` come
 * back `null` even though the older four fields are already populated.
 * This gate means the carousel just skips the insights slides entirely in
 * that window, not that it shows a broken frequency card.
 */
export const MIN_90D_SAMPLES_FOR_INSIGHTS = 3;

export interface PriceHistoryInsight {
  key: "low" | "high" | "avg" | "frequency";
  label: string;
  /** Big headline value for the card, already formatted for display. */
  value: string;
  /** Optional smaller supporting line -- currently only "frequency" uses this. */
  detail?: string;
}

/**
 * Frequency tier boundaries (2026-08-20, replacing a raw "X% of checks"
 * headline). Applied to the duration-weighted `specialDayPct`
 * (= ninetyDaySpecialDays / ninetyDayDaysTracked * 100), NOT the old
 * event-count-based percentage -- price_history is changes-only storage
 * (scraper.js), so counting transition ROWS conflated "how often price
 * changed" with "how much time was spent on special" (concretely: a
 * product that went on special 5 days ago with no price change since had
 * exactly one transition row in the 90-day window, so the old row-count
 * version read "100% of checks" -- see dodgy_deals_view.sql's "Fix
 * (2026-08-20)" for the full writeup). The tier is the card's HEADLINE
 * (not the raw %) because a bare number like "27%" doesn't tell a user
 * whether that's normal or remarkable -- the tier does that work. The
 * "Frequently Discounted" tier also does something the raw % never did:
 * flags a pattern this app exists to catch (a product discounted most of
 * the time isn't really having a "sale").
 */
// Tier text changed "X Discounted" -> "X on special" 2026-08-21, per Jay:
// "the 4th tile is a bit packed with info: On special / Frequently
// Discounted / 47 of the last 90 days tracked -- could we simplify it to:
// Frequently on special / 47 times in the last 90 days." The old 3-line
// layout (a small "On special" caption label + this tier text as the big
// headline + a separate detail line) is now 2 lines -- this tier string
// alone is now the whole headline (folding what the caption used to say
// into the phrase itself, see `buildPriceHistoryInsights` below), so it
// needs to read as a complete phrase on its own rather than pairing with a
// caption above it.
// Tier text changed "X on special" -> "X special" 2026-08-21, per Jay:
// "Update on the 90 day tips grid - final tile - Occasional special,
// Frequent special, Rare special (update and use for each special type
// text)." Implemented as the exact 3 phrases he gave, adjective-first
// ("Occasional"/"Frequent"/"Rare" + "special") replacing the previous
// adverb-first "Occasionally/Frequently/Rarely on special". The
// zero-special-days case ("Never on special") is NOT in Jay's list of 3 --
// left as-is rather than guessed into "Never special" (a different, odd-
// sounding construction Jay didn't type), since his own wording ("each
// special type") reads as covering the 3 he actually named, not a directive
// to invent a matching 4th. Flagged here rather than silently changed or
// silently left ambiguous.
function frequencyTierLabel(specialDays: number, specialDayPct: number): string {
  if (specialDays === 0) return "Never on special";
  if (specialDayPct < 15) return "Rare special";
  if (specialDayPct < 40) return "Occasional special";
  return "Frequent special";
}

/**
 * Returns 0 or 4 insights (never a partial set) -- 4 sits inside spec's
 * "three to five" range. Below `MIN_90D_SAMPLES_FOR_INSIGHTS`, returns []
 * rather than showing a low/high/avg built from 1-2 data points, which
 * would technically be real but reads as more authoritative than it is --
 * same anti-fabrication spirit as the rest of this app (an empty return
 * here is the caller's cue to skip the insights slides in the carousel
 * entirely, not render three identical-looking numbers).
 */
export function buildPriceHistoryInsights(deal: CurrentDeal): PriceHistoryInsight[] {
  if (
    deal.ninetyDaySamples == null ||
    deal.ninetyDaySamples < MIN_90D_SAMPLES_FOR_INSIGHTS ||
    deal.ninetyDayLow == null ||
    deal.ninetyDayHigh == null ||
    deal.ninetyDayAvg == null ||
    deal.ninetyDaySpecialSamples == null ||
    deal.ninetyDayDaysTracked == null ||
    deal.ninetyDayDaysTracked <= 0 ||
    deal.ninetyDaySpecialDays == null
  ) {
    return [];
  }

  const specialDayPct = Math.round((deal.ninetyDaySpecialDays / deal.ninetyDayDaysTracked) * 100);

  // Labels sentence-cased 2026-08-20 per Jay's ask ("grid tiles ... titles
  // should be sentence case") -- was Title Case ("90-Day Low" etc.). Values
  // (the $ amounts, frequencyTierLabel's tier text) are untouched -- Jay's
  // ask was specifically about the tile TITLES (the small label above each
  // big number), not the headline value itself.
  //
  // "frequency" tile simplified 2026-08-21, per Jay: "the 4th tile is a bit
  // packed with info: On special / Frequently Discounted / 47 of the last
  // 90 days tracked -- could we simplify it to: Frequently on special / 47
  // times in the last 90 days." `label` is now "" (was "On special") --
  // `frequencyTierLabel` above now folds that word into its own tier text
  // ("Frequently on special", not just "Frequently"), so the separate small
  // caption above it became redundant. `PriceHistoryInsightCard.tsx` only
  // renders a tile's label line when it's non-empty (matches how it already
  // treats `detail`), so this collapses the tile from 3 lines to 2 -- the
  // same line count every other tile in this grid already has, so all 4
  // now vertically center the same way.
  // `detail` reworded "X of the last Y days tracked" -> "X times in the
  // last Y days", Jay's own phrasing -- `Y` is still the real
  // `ninetyDayDaysTracked` value (not a hardcoded "90"), since that can be
  // less than 90 when there isn't a full 90 days of history yet; only the
  // wording changed, not which number is shown. FLAGGED, not silently
  // "fixed": `ninetyDaySpecialDays` is a duration-weighted DAY COUNT (see
  // this function's own header comment on why -- price_history is
  // changes-only storage, so this counts days spent on special, not
  // discrete discount EVENTS), so "times" is a slightly loose word for what
  // this number actually measures. Implemented exactly as Jay typed it
  // anyway (this codebase's standing convention for quoted copy) since the
  // reading is close enough to not be misleading in practice.
  //
  // Reworded again 2026-08-21, per Jay: '4th grid tile - Rare special / 5
  // times in the last 90 days -- Update text to "5 times in 90 days"'.
  // Just drops "the last" -- `Y` is still the same real
  // `ninetyDayDaysTracked` value, same FLAGGED "times" caveat above still
  // applies unchanged.
  return [
    { key: "low", label: "90-day low", value: `$${deal.ninetyDayLow.toFixed(2)}` },
    { key: "high", label: "90-day high", value: `$${deal.ninetyDayHigh.toFixed(2)}` },
    { key: "avg", label: "90-day average", value: `$${deal.ninetyDayAvg.toFixed(2)}` },
    {
      key: "frequency",
      label: "",
      value: frequencyTierLabel(deal.ninetyDaySpecialDays, specialDayPct),
      detail: `${deal.ninetyDaySpecialDays} times in ${deal.ninetyDayDaysTracked} days`,
    },
  ];
}
