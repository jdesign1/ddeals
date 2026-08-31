/**
 * Live-catalogue data layer — direct TypeScript port of the fetch/grouping
 * pipeline in `Prototype/index.html` (ported 2026-08-08, matches the
 * "specials-only dodgy_deals architecture" as of commit `fa2abf70`).
 *
 * Source functions ported 1:1: `fetchAllRows`, `fetchByIds`, `buildMatchIndex`,
 * `mergeProductMeta`, `buildProductCardsFromSpecials`, `fetchNonSpecialProductCards`,
 * `loadLiveProducts`. Now includes both of the prototype's egress-saving
 * layers: the persistent, cross-session IndexedDB catalogue cache
 * (`catalogue-cache.ts`, ported 2026-08-08 after Jay asked specifically
 * about egress efficiency) AND `loadLiveProducts()`'s own short-TTL
 * in-memory request cache (added the same day, for a different reason --
 * real production 500s traced to concurrent callers, see its own doc
 * comment). The two compose: IndexedDB avoids re-fetching across page
 * loads/sessions, the in-memory layer avoids re-fetching across
 * *simultaneous* callers within one session when IndexedDB itself misses.
 *
 * Uses raw REST fetch against PostgREST (same pattern as the prototype),
 * not the `@supabase/supabase-js` client — kept consistent with the proven
 * live code path rather than introducing a second data-access pattern.
 *
 * Keep in sync with `Prototype/index.html` (source of truth) whenever the
 * view shape or grouping logic changes there.
 */

import { readCatalogueCache, readCatalogueCacheMetadata, writeCatalogueCache, writeCatalogueCacheMetadata } from "./catalogue-cache.ts";
import { MATERIAL_OVER_NORMAL_THRESHOLD, REAL_SAVER_THRESHOLD, SHRINKFLATION_THRESHOLD, type EvidenceStrength } from "./classify.ts";

export interface DodgyDealsRow {
  product_id: string;
  store_id: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  store_name: string | null;
  sale_price: number;
  normal_price: number | null;
  saving_pct: number | null;
  /** Structured unit-price evidence emitted by the dodgy_deals view. */
  inflate_pct?: number | null;
  sale_unit_price?: number | null;
  sale_unit_label?: string | null;
  unit_price_change_pct?: number | null;
  unit_price_samples?: number | null;
  unit_price_coverage_days?: number | null;
  unit_price_max_span_days?: number | null;
  history_days?: number | null;
  special_label: string | null;
  was_price: number | null;
  special_end_date: string | null;
  image_url: string | null;
  unit_size: string | null;
  sale_started_at: string | null;
  product_url?: string | null;
  verdict: "DODGY" | "GENUINE" | "MARGINAL" | "UNKNOWN";
  reason: string | null;
  // Price History Insights (2026-08-19) -- real 90-day-calendar-window
  // stats from the dodgy_deals view's new `history_90d` CTE. See that
  // view's own "Feature (2026-08-19)" header comment for the NULL
  // contract: price_history_90d_samples is the single gate (NULL = no
  // price_history rows in the window, skip the insight); when it's
  // non-null the other columns are populated, and special_samples may
  // legitimately be 0 ("never on special" -- a real fact, not missing
  // data). REQUIRES migrations/20260819_dodgy_deals_price_history_
  // insights.sql to be applied to the live database BEFORE (or in the same
  // deploy as) this file's `select=` change below -- PostgREST 400s a
  // request for a column it doesn't recognize, and this same query backs
  // every page (Home, Specials, the deal page), not just the new carousel.
  // See project.md's 2026-08-19 session entry for deploy-order notes.
  price_history_90d_low?: number | null;
  price_history_90d_high?: number | null;
  price_history_90d_avg?: number | null;
  price_history_90d_samples?: number | null;
  price_history_90d_special_samples?: number | null;
  // Duration-weighted frequency (2026-08-20) -- see dodgy_deals_view.sql's
  // "Fix (2026-08-20)" header comment: price_history_90d_samples/
  // _special_samples above COUNT transition rows, not days -- misleading
  // as a "how often is this on special" stat (a single price-change event
  // 5 days ago reads as "100% of checks" even though it's only been
  // discounted 5 of the last 90 days). These two are duration-weighted --
  // actual days covered / actual days on special -- and are the columns
  // the UI's frequency stat should read, not the _samples pair. SAME
  // deploy-order requirement as above: REQUIRES migrations/20260820_
  // dodgy_deals_time_weighted_history.sql applied live before (or with)
  // adding these two names to the `select=` string below.
  price_history_90d_days_tracked?: number | null;
  price_history_90d_special_days?: number | null;
  /** Evidence metadata emitted by the classifier. */
  regular_price_samples?: number | null;
  regular_history_days?: number | null;
  evidence_status?: "SUFFICIENT" | "EARLY" | "INSUFFICIENT" | "LIMITED" | null;
  evidence_strength?: EvidenceStrength | null;
  store_history_ready?: boolean | null;
  classifier_version?: string | null;
  /** Timestamp of the materialized cache refresh that produced this row. */
  cache_refreshed_at?: string | null;
}

export interface CurrentDeal {
  /** Exact retailer row identifiers used for low-egress detail revalidation. */
  sourceProductId?: string | null;
  sourceStoreId?: string | null;
  store: string;
  price: number;
  originalPrice: number;
  discountPercentage: number;
  dealType: "Dodgy Deal" | "Real Deal" | "Fair Price" | "Unverified Deal";
  wasArtificiallyInflated: boolean;
  /** A strong price-gap signal with duration-only evidence; not confirmed. */
  isDodgyReviewCandidate?: boolean;
  reason: string;
  explanation: string | null;
  isOnSpecial: boolean;
  saleStartedAt: string | null;
  specialEndDate: string | null;
  /** Canonical retailer product page URL, when the scraper captured one. */
  productUrl?: string | null;
  /** Price History Insights (2026-08-19) -- see DodgyDealsRow's own doc
   * comment for the NULL contract. All null/0 on cards built by
   * fetchNonSpecialProductCards (no dodgy_deals row backs those). */
  ninetyDayLow: number | null;
  ninetyDayHigh: number | null;
  ninetyDayAvg: number | null;
  ninetyDaySamples: number | null;
  ninetyDaySpecialSamples: number | null;
  /** Duration-weighted frequency (2026-08-20) -- see DodgyDealsRow's own
   * doc comment. Use these for "how often is this on special" display,
   * not ninetyDaySamples/ninetyDaySpecialSamples (event counts). */
  ninetyDayDaysTracked: number | null;
  ninetyDaySpecialDays: number | null;
  /** Evidence metadata used to keep incomplete-history specials neutral. */
  evidenceStatus?: "SUFFICIENT" | "EARLY" | "INSUFFICIENT" | "LIMITED" | null;
  evidenceStrength?: EvidenceStrength | null;
  storeHistoryReady?: boolean | null;
  classifierVersion?: string | null;
  unitPriceSamples?: number | null;
  unitPriceCoverageDays?: number | null;
  unitPriceMaxSpanDays?: number | null;
}

/** A sparse price/special-state transition from the retailer history table. */
export interface PriceHistoryPoint {
  price: number;
  isSpecial: boolean;
  scrapedAt: string;
}

export interface ProductCard {
  id: string;
  brand: string;
  name: string;
  category: string;
  image: string;
  standardPrice: number;
  unit: string;
  currentDeals: CurrentDeal[];
  priceHistory: [];
  description: string;
}

export interface SupabaseRestConfig {
  url: string;
  anonKey: string;
}

export const STORE_DISPLAY_FALLBACK: Record<string, string> = {
  newworld: "New World",
  paknsave: "PAK'nSAVE",
  woolworths: "Woolworths",
  foursquare: "Four Square",
  supervalue: "SuperValue",
};

export const FALLBACK_PRODUCT_IMAGE = "https://placehold.co/300x300?text=No+Image";

// Keyed on exactly the non-UNKNOWN verdict values (not a loose Record<string, ...>) so
// that if a new verdict value is ever added to the `dodgy_deals` view, TypeScript flags
// every lookup site instead of silently producing `dealType: undefined` at runtime — pure
// type-level tightening, does not change the ported runtime behavior below.
export const VIEW_VERDICT_TO_DEAL_TYPE: Record<
  Exclude<DodgyDealsRow["verdict"], "UNKNOWN">,
  CurrentDeal["dealType"]
> = {
  DODGY: "Dodgy Deal",
  GENUINE: "Real Deal",
  MARGINAL: "Fair Price",
};

export const VIEW_VERDICT_SHORT_REASON: Record<string, string> = {
  DODGY: "Artificial Discount (Was-Is Trap)",
  GENUINE: "Genuine Sale",
  MARGINAL: "Fair Price",
  UNKNOWN: "Not Enough History",
};

/**
 * A deliberately separate review threshold for duration-only evidence. This
 * does not change the upstream verdict: it only identifies a narrow group of
 * unknown rows worth showing in the Dodgy review filter. A single long-held
 * baseline can be stale, so the price gap must be materially larger than the
 * normal 5% Dodgy threshold before we surface it for more checking.
 */
export const DODGY_REVIEW_OVER_NORMAL_THRESHOLD = 15;

/**
 * Identifies a possible Dodgy signal without converting it into a confirmed
 * Dodgy verdict. Every condition is required so early, incomplete, legacy,
 * and store-history-not-ready rows remain neutral.
 */
export function isDodgyReviewCandidate(row: Pick<
  DodgyDealsRow,
  "verdict" | "evidence_status" | "evidence_strength" | "store_history_ready" | "normal_price" | "sale_price"
>): boolean {
  if (
    row.verdict !== "UNKNOWN" ||
    row.evidence_status !== "SUFFICIENT" ||
    row.evidence_strength !== "DURATION_ONLY" ||
    row.store_history_ready !== true ||
    row.normal_price == null ||
    row.normal_price <= 0
  ) {
    return false;
  }

  return row.sale_price > row.normal_price * (1 + DODGY_REVIEW_OVER_NORMAL_THRESHOLD / 100);
}

/**
 * Keeps client-side compatibility during the view/cache rollout. Evidence-aware
 * rows trust the backend's reason-specific verdict. Older evidence-aware cache
 * rows that called a duration-only unit signal Dodgy are downgraded until the
 * new unit coverage fields arrive; genuinely above-normal prices remain Dodgy.
 * Completely legacy rows retain their old text fallback until they are replaced.
 */
function effectiveViewVerdict(row: DodgyDealsRow): DodgyDealsRow["verdict"] {
  // Rows from the migration window have no evidence_status at all; preserve
  // their legacy verdict contract. Once the field is present, only SUFFICIENT
  // evidence may publish a directional verdict.
  if (row.evidence_status != null && row.evidence_status !== "SUFFICIENT") return "UNKNOWN";
  if (row.verdict !== "DODGY" || row.normal_price == null || row.normal_price <= 0) return row.verdict;

  if (
    row.evidence_status != null &&
    row.evidence_strength === "DURATION_ONLY" &&
    row.unit_price_samples == null &&
    row.classifier_version !== "20260830-v2" &&
    row.classifier_version !== "20260830-v3" &&
    row.classifier_version !== "20260830-v4" &&
    row.sale_price <= row.normal_price * (1 + MATERIAL_OVER_NORMAL_THRESHOLD / 100)
  ) {
    return row.saving_pct != null && row.saving_pct >= REAL_SAVER_THRESHOLD ? "GENUINE" : "MARGINAL";
  }

  const reason = (row.reason || "").toLowerCase();
  // Prefer the structured numeric signal so future retailer wording changes
  // cannot hide a shrinkflation verdict. The text check remains only for old
  // cache rows that predate unit_price_change_pct, including Woolworths' legacy
  // "price per ... / smaller pack" wording.
  const hasStructuredShrinkflationSignal =
    row.saving_pct != null &&
    row.saving_pct > 0 &&
    row.unit_price_change_pct != null &&
    row.unit_price_change_pct > -SHRINKFLATION_THRESHOLD;
  const hasLegacyTextDodgySignal =
    row.evidence_status == null &&
    /pack size|smaller pack|unit price|price per|\$\/unit|raised|inflated|pump/.test(reason);
  const hasIndependentDodgySignal = hasStructuredShrinkflationSignal || hasLegacyTextDodgySignal;

  const increasePct = ((row.sale_price - row.normal_price) / row.normal_price) * 100;

  if (!hasIndependentDodgySignal && increasePct <= MATERIAL_OVER_NORMAL_THRESHOLD) return "MARGINAL";
  return row.verdict;
}

export const titleCase = (s: string | null | undefined): string =>
  (s || "").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * PostgREST can cap responses (commonly at 1000 rows) even when the caller
 * requests a larger range. Fetches page 1 with `Prefer: count=exact`, then
 * uses the number of rows actually returned as the real page size before
 * firing the remaining pages in parallel. This matters when callers ask for
 * 20,000 rows but the API returns only 1,000: the old implementation treated
 * that short response as complete and silently dropped everything after row
 * 1,000.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  config: SupabaseRestConfig,
  path: string,
  pageSize = 1000
): Promise<T[]> {
  const page = pageSize;
  const MAX_PAGES = 100; // safety cap based on the number of rows the server actually returns per page

  const fetchPage = async (start: number, count: number, extraHeaders?: Record<string, string>) => {
    const res = await fetch(`${config.url}/rest/v1/${path}`, {
      cache: "no-store",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Range-Unit": "items",
        Range: `${start}-${start + count - 1}`,
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return res;
  };

  const firstRes = await fetchPage(0, page, { Prefer: "count=exact" });
  const firstData = (await firstRes.json()) as T[];
  const contentRange = firstRes.headers.get("content-range"); // e.g. "0-999/12702"
  const returnedRange = contentRange?.split("/")[0];
  const [returnedStart, returnedEnd] = returnedRange?.split("-").map(Number) ?? [0, firstData.length - 1];
  const actualPageSize = returnedEnd >= returnedStart ? returnedEnd - returnedStart + 1 : firstData.length;
  const total =
    contentRange && contentRange.includes("/") ? parseInt(contentRange.split("/")[1], 10) : NaN;

  if (!Number.isFinite(total) || actualPageSize <= 0 || total <= firstData.length) {
    return firstData; // no exact count available, or that one page was everything
  }

  const remainingPages = Math.ceil((total - firstData.length) / actualPageSize);
  if (remainingPages > MAX_PAGES - 1) {
    throw new Error(`${path} -> response exceeds safe pagination limit of ${MAX_PAGES * actualPageSize} rows`);
  }
  const restResponses = await Promise.all(
    Array.from({ length: remainingPages }, (_, i) => fetchPage(firstData.length + actualPageSize * i, page))
  );
  const restData = await Promise.all(restResponses.map((res) => res.json() as Promise<T[]>));
  return firstData.concat(...restData);
}

/** Batched `in.(...)` lookups, chunked to stay under PostgREST/URL length limits. */
export async function fetchByIds<T = Record<string, unknown>>(
  config: SupabaseRestConfig,
  path: string,
  column: string,
  select: string,
  ids: string[],
  chunkSize = 100
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const url = `${config.url}/rest/v1/${path}?select=${select}&${column}=in.(${chunk.join(",")})`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
      });
      if (!res.ok) throw new Error(`${path} in-lookup -> HTTP ${res.status}`);
      return res.json() as Promise<T[]>;
    })
  );
  return results.flat();
}

export interface MatchIndex {
  find: (x: string) => string;
  edgeCount: number;
}

/**
 * Union-find over `products.canonical_product_id` (exact-SKU matches) and
 * `app_comparable_family_links` (reviewed "fair to compare" pairs) so
 * genuinely matched items from different retailer catalogue rows resolve to
 * one group id.
 *
 * `union()`'s root choice is deliberately deterministic -- always keeps
 * whichever of the two roots sorts lexicographically FIRST, rather than
 * "whichever id the row order happened to union in last" (traced this
 * session, 2026-08-20, as the real root cause of "products already on your
 * list still show a Plus icon instead of a tick on Home/Search" -- see
 * `AddToListButton.tsx`'s own doc comment for the symptom). `find(x)`'s
 * returned root becomes `ProductCard.id` (`buildProductCardsFromSpecials`
 * below), which is exactly what gets written to `list_items.product_id`
 * when a product is added to a list. Neither of this function's two source
 * queries has an `ORDER BY` (`select=...` with no `order=`), so Postgres/
 * PostgREST doesn't guarantee row order is identical between calls --  and
 * in practice it doesn't need to be malicious to actually change: the
 * 15-minute `dodgy_deals_cache` refresh, ordinary autovacuum, or simply a
 * different physical scan plan is enough. With the OLD "last union() call
 * wins" rule, that meant the SAME real-world matched product could resolve
 * to a different `find()` root on two different page loads -- so a product
 * added to a list under root A could later render, on a fresh fetch that
 * happened to union the same group into root B instead, with `addedTo`
 * empty for root B and the trigger icon stuck on Plus even though the
 * product genuinely was saved (just under A). Deterministic min-of-group
 * rooting fixes this at the source: for any fixed *set* of union edges
 * (which doesn't depend on fetch order, only on which rows exist), always
 * re-rooting to the lexicographically smaller id converges to the same
 * global-minimum root for every id in a connected component regardless of
 * the order those edges were unioned in -- verified by hand for both
 * processing orders of a 3-node chain before relying on it here, also
 * covered by `data.test.ts`'s new
 * "buildMatchIndex: find() is stable regardless of row fetch order" test.
 * Flagged, not silently left implicit: any list item ALREADY saved under a
 * pre-fix, non-deterministic root (this session's own test data included)
 * can still mismatch once against this new deterministic root the first
 * time it's re-resolved -- there's no way to migrate `list_items.product_id`
 * retroactively from here, this only guarantees stability GOING FORWARD.
 */
export async function buildMatchIndex(config: SupabaseRestConfig): Promise<MatchIndex> {
  const [canonicalRows, comparableRows] = await Promise.all([
    fetchAllRows<{ id: string; canonical_product_id: string }>(
      config,
      "products?select=id,canonical_product_id&canonical_product_id=not.is.null"
    ),
    fetchAllRows<{ left_product_id: string; right_product_id: string }>(
      config,
      "app_comparable_family_links?select=left_product_id,right_product_id"
    ),
  ]);

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Deterministic: the lexicographically SMALLER root always wins,
    // regardless of which of a/b was passed first or which order union()
    // is called in -- see this function's own top-of-file doc comment for
    // why that determinism is the actual fix, not a style preference.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };

  for (const row of canonicalRows) union(row.id, row.canonical_product_id);
  for (const row of comparableRows) union(row.left_product_id, row.right_product_id);

  return { find, edgeCount: canonicalRows.length + comparableRows.length };
}

interface ProductMetaInput {
  name: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  unit_size: string | null;
}

/**
 * Field-by-field merge across every retailer's own product row in a match
 * group, so a group still displays a full card even if e.g. only one
 * retailer's listing has an image_url or category set.
 */
export function mergeProductMeta(memberMetas: ProductMetaInput[]): ProductMetaInput {
  const pick = (field: keyof ProductMetaInput) =>
    memberMetas.map((m) => m && m[field]).find((v) => v != null && v !== "") ?? null;
  return {
    name: pick("name"),
    brand: pick("brand"),
    category: pick("category"),
    image_url: pick("image_url"),
    unit_size: pick("unit_size"),
  };
}

function currentDealFromRow(row: DodgyDealsRow): CurrentDeal {
  const verdict = effectiveViewVerdict(row);
  const isDodgyReviewCandidateRow = isDodgyReviewCandidate(row);
  return {
    sourceProductId: row.product_id,
    sourceStoreId: row.store_id,
    store: row.store_name || STORE_DISPLAY_FALLBACK[row.store_id] || titleCase(row.store_id),
    price: row.sale_price,
    originalPrice: row.normal_price ?? row.was_price ?? row.sale_price,
    discountPercentage: Math.max(0, Math.round(row.saving_pct ?? 0)),
    dealType: verdict === "UNKNOWN" ? "Unverified Deal" : VIEW_VERDICT_TO_DEAL_TYPE[verdict],
    wasArtificiallyInflated: verdict === "DODGY",
    isDodgyReviewCandidate: isDodgyReviewCandidateRow,
    reason: VIEW_VERDICT_SHORT_REASON[verdict] || "Standard Special",
    explanation: row.reason,
    isOnSpecial: true,
    saleStartedAt: row.sale_started_at || null,
    specialEndDate: row.special_end_date || null,
    productUrl: row.product_url ?? null,
    ninetyDayLow: row.price_history_90d_low ?? null,
    ninetyDayHigh: row.price_history_90d_high ?? null,
    ninetyDayAvg: row.price_history_90d_avg ?? null,
    ninetyDaySamples: row.price_history_90d_samples ?? null,
    ninetyDaySpecialSamples: row.price_history_90d_special_samples ?? null,
    ninetyDayDaysTracked: row.price_history_90d_days_tracked ?? null,
    ninetyDaySpecialDays: row.price_history_90d_special_days ?? null,
    evidenceStatus: row.evidence_status ?? null,
    evidenceStrength: row.evidence_strength ?? null,
    storeHistoryReady: row.store_history_ready ?? null,
    classifierVersion: row.classifier_version ?? null,
    unitPriceSamples: row.unit_price_samples ?? null,
    unitPriceCoverageDays: row.unit_price_coverage_days ?? null,
    unitPriceMaxSpanDays: row.unit_price_max_span_days ?? null,
  };
}

/**
 * Groups current-special rows by resolved match-group id and builds one
 * product card per group. Dedupes to the best (lowest) price per store
 * within a group — the identity-matching pipeline occasionally links two
 * distinct retailer catalogue rows from the *same* store into one group, a
 * known upstream data-quality quirk.
 */
export function buildProductCardsFromSpecials(
  groupEntries: [string, DodgyDealsRow[]][]
): ProductCard[] {
  const products: ProductCard[] = [];
  for (const [groupId, rows] of groupEntries) {
    const meta = mergeProductMeta(
      rows.map((r) => ({
        name: r.product_name,
        brand: r.brand,
        category: r.category,
        image_url: r.image_url,
        unit_size: r.unit_size,
      }))
    );
    if (!meta.name) continue;

    const currentDeals: CurrentDeal[] = rows.map(currentDealFromRow);

    const bestDealByStore = new Map<string, CurrentDeal>();
    for (const deal of currentDeals) {
      const existing = bestDealByStore.get(deal.store);
      if (!existing || deal.price < existing.price) bestDealByStore.set(deal.store, deal);
    }
    const dedupedDeals = [...bestDealByStore.values()];
    if (!dedupedDeals.length) continue;

    const normalPrices = rows.map((r) => r.normal_price).filter((p): p is number => p != null);

    products.push({
      id: groupId,
      brand: titleCase(meta.brand) || "Unbranded",
      name: titleCase(meta.name),
      category: meta.category || "Grocery",
      image: meta.image_url || FALLBACK_PRODUCT_IMAGE,
      standardPrice: normalPrices.length
        ? Math.min(...normalPrices)
        : Math.min(...rows.map((r) => r.sale_price)),
      unit: meta.unit_size || "",
      currentDeals: dedupedDeals,
      priceHistory: [],
      description: "",
    });
  }
  return products;
}

/**
 * Loads current specials only (per the 2026-08-07 scope decision) — the app
 * searches/browses current specials, using history purely to rank them, not
 * full-catalogue browsing. Sourced from `dodgy_deals_cache` (see below),
 * grouped into real cross-store match groups via the union-find matchIndex.
 */
interface LiveProductsLoadResult {
  products: ProductCard[];
  /** Cache refresh timestamp from the exact rows used to build these cards. */
  sourceUpdatedAt: number | null;
}

async function loadLiveProductsUncached(config: SupabaseRestConfig): Promise<LiveProductsLoadResult> {
  const [specialRows, matchIndex] = await Promise.all([
    // 2026-08-09: production 500s on this exact query traced (via Supabase API
    // + Postgres logs, not guessed) to `canceling statement due to statement
    // timeout` on `dodgy_deals`. Root cause: `dodgy_deals` is a plain (not
    // materialized) view with an expensive CTE chain -- a window function
    // over the *entire* price_history table plus several joins/sorts -- that
    // measured ~3s per execution standalone. Because it's a view, PostgREST
    // recomputes the whole thing from scratch for *every page*, and
    // fetchAllRows's default 1000-row page size meant one Home-tab load fired
    // ~9 concurrent full recomputes of that 3s query (for ~9k current-special
    // rows) via its Promise.all page fan-out. That 9x concurrent DB load is
    // what pushed individual executions past the 2min statement_timeout,
    // producing the intermittent 500s (interleaved with 200s/206s from
    // whichever concurrent copies finished in time) seen in the API logs.
    // Fix: request one page large enough to cover the current row count
    // (~9k, checked via Supabase MCP) so this fetch runs the view ONCE
    // instead of ~9 times concurrently. Doesn't touch the view itself --
    // the 30s in-flight request cache above still collapses same-session
    // overlapping callers on top of this. See project.md (2026-08-09 entry)
    // for the full diagnosis.
    //
    // 2026-08-12: pointed at `dodgy_deals_cache` (a materialized view, new
    // this session) instead of `dodgy_deals` (the live view) itself. Even
    // after that same day's `pre_sale` LATERAL fix, live EXPLAIN ANALYZE
    // (run repeatedly, both directly and by independent peer review) still
    // measured `dodgy_deals` swinging ~480ms-3,770ms run to run -- the slow
    // end already exceeds the anon role's 3s statement_timeout outright on
    // a cold cache, which is why this exact endpoint kept producing
    // recurring 500s across five separate sessions despite several rounds
    // of CTE-level optimization.
    // `dodgy_deals_cache` is `CREATE MATERIALIZED VIEW ... AS SELECT * FROM
    // dodgy_deals` (same columns/types/verdict logic, zero duplicated
    // business logic to keep in sync), refreshed on a 15-minute pg_cron
    // schedule (`REFRESH MATERIALIZED VIEW CONCURRENTLY`, non-blocking for
    // readers) rather than recomputed per-request -- live EXPLAIN ANALYZE
    // measured reading it at ~3.5ms. `dodgy_deals` itself is untouched and
    // still directly queryable if a real-time (not up-to-15-minutes-stale)
    // read is ever needed. See project.md (2026-08-12 "efficiency deep
    // dive" entry) for the full measurement/design writeup.
    //
    // 2026-08-19: shipped the 5 price_history_90d_* columns in this select=
    // string BEFORE migrations/20260819_dodgy_deals_price_history_insights.sql
    // reached the live database -- caused a live PostgREST 400 on every page
    // ("Couldn't load today's specials", reported by Jay), hotfixed by
    // reverting this string, then re-added here ONLY after Jay confirmed the
    // migration was applied to the real database (see project.md's
    // 2026-08-19 entry for the full incident writeup). If this 400s again,
    // that almost certainly means the migration got rolled back or applied
    // to the wrong project -- check `select column_name from
    // information_schema.columns where table_name = 'dodgy_deals_cache' and
    // column_name like 'price_history_90d%'` returns 5 rows before assuming
    // it's something else.
    //
    // 2026-08-20: price_history_90d_days_tracked/price_history_90d_special_days
    // added below ONLY after Jay confirmed migrations/20260820_dodgy_deals_
    // time_weighted_history.sql AND migrations/20260820_rebuild_dodgy_deals_
    // cache_for_time_weighted_columns.sql are both live -- verified via a
    // direct column read (`SELECT price_history_90d_low,
    // price_history_90d_days_tracked, price_history_90d_special_days FROM
    // public.dodgy_deals_cache LIMIT 1`, not information_schema -- that
    // excludes materialized views entirely and always returns 0 rows for
    // dodgy_deals_cache regardless of real state, a separate bug this
    // project already hit twice; see project.md's 2026-08-20 entry). Real
    // data came back (0.99 / 12 / 10), confirming both migrations are live
    // and dodgy_deals_cache actually carries these columns, not just the
    // dodgy_deals view. If this 400s, check that same direct-column query
    // before assuming anything else -- same incident shape as 2026-08-19.
    fetchSpecialRows(config),
    buildMatchIndex(config),
  ]);
  const sourceUpdatedAt = specialRows.reduce<number | null>((latest, row) => {
    const timestamp = row.cache_refreshed_at ? Date.parse(row.cache_refreshed_at) : NaN;
    if (!Number.isFinite(timestamp)) return latest;
    return latest === null ? timestamp : Math.max(latest, timestamp);
  }, null);
  if (!specialRows.length) return { products: [], sourceUpdatedAt };

  const byGroup = new Map<string, DodgyDealsRow[]>();
  for (const row of specialRows) {
    const groupId = matchIndex.find(row.product_id);
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId)!.push(row);
  }

  return { products: buildProductCardsFromSpecials([...byGroup.entries()]), sourceUpdatedAt };
}

interface LiveProductsCacheEntry {
  promise: Promise<LiveProductsLoadResult>;
  resolvedAt: number | null;
}

const ENRICHED_SPECIALS_SELECT =
  "dodgy_deals_cache?select=product_id,store_id,product_name,brand,category,store_name,sale_price,normal_price,saving_pct,inflate_pct,sale_unit_price,sale_unit_label,unit_price_change_pct,unit_price_samples,unit_price_coverage_days,unit_price_max_span_days,history_days,special_label,was_price,special_end_date,image_url,unit_size,sale_started_at,product_url,verdict,reason,price_history_90d_low,price_history_90d_high,price_history_90d_avg,price_history_90d_samples,price_history_90d_special_samples,price_history_90d_days_tracked,price_history_90d_special_days,regular_price_samples,regular_history_days,evidence_status,evidence_strength,store_history_ready,classifier_version,cache_refreshed_at";

const LEGACY_SPECIALS_SELECT =
  "dodgy_deals_cache?select=product_id,store_id,product_name,brand,category,store_name,sale_price,normal_price,saving_pct,inflate_pct,sale_unit_price,sale_unit_label,unit_price_change_pct,history_days,special_label,was_price,special_end_date,image_url,unit_size,sale_started_at,product_url,verdict,reason,price_history_90d_low,price_history_90d_high,price_history_90d_avg,price_history_90d_samples,price_history_90d_special_samples,price_history_90d_days_tracked,price_history_90d_special_days";

/** A detail-page validation is tiny compared with the full catalogue fetch. */
export const TARGETED_DEAL_VALIDATION_COOLDOWN_MS = 5 * 60 * 1000;

export interface CurrentDealValidationResult {
  row: DodgyDealsRow | null;
  refreshed: boolean;
  throttled: boolean;
  retryAfterMs: number;
}

interface TargetedDealValidationEntry {
  promise: Promise<CurrentDealValidationResult> | null;
  lastValidatedAt: number | null;
  row: DodgyDealsRow | null;
}

/** Exported for tests only; the app should use validateCurrentDeal(). */
export const __targetedDealValidations = new Map<string, TargetedDealValidationEntry>();

async function fetchFirstRow<T>(config: SupabaseRestConfig, path: string): Promise<T | null> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    cache: "no-store",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Range-Unit": "items",
      Range: "0-0",
    },
  });
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}`);
  const rows = (await response.json()) as T[];
  return rows[0] ?? null;
}

/**
 * Cheap catalogue revalidation marker. `catalogue_publications.published_at`
 * changes only after the materialized-view refresh has succeeded and the
 * publication row has been updated. A failure is deliberately treated as
 * "unknown" by callers so a transient metadata outage never prevents the app
 * from using its last good catalogue.
 */
async function fetchLatestPublicationTimestamp(config: SupabaseRestConfig): Promise<number | null> {
  try {
    const row = await fetchFirstRow<{ published_at: string | null }>(
      config,
      "catalogue_publications?select=published_at&id=eq.live&limit=1"
    );
    if (row?.published_at) {
      const timestamp = Date.parse(row.published_at);
      if (Number.isFinite(timestamp)) return timestamp;
    }
  } catch {
    // Backward-compatible deployment window: older databases do not have
    // catalogue_publications yet. Continue through the older markers below.
  }

  try {
    const row = await fetchFirstRow<{ cache_refreshed_at: string | null }>(
      config,
      "dodgy_deals_cache?select=cache_refreshed_at&limit=1"
    );
    if (row?.cache_refreshed_at) {
      const timestamp = Date.parse(row.cache_refreshed_at);
      if (Number.isFinite(timestamp)) return timestamp;
    }
  } catch {
    // Backward-compatible deployment window: older databases do not have
    // cache_refreshed_at yet. Continue to the original current_prices marker.
  }

  try {
    const row = await fetchFirstRow<{ updated_at: string | null }>(
      config,
      "current_prices?select=updated_at&is_special=eq.true&order=updated_at.desc&limit=1"
    );
    if (!row?.updated_at) return null;
    const timestamp = Date.parse(row.updated_at);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

interface LatestSourceTimestampCacheEntry {
  promise: Promise<number | null>;
  resolvedAt: number | null;
}

const latestSourceTimestampCache = new Map<string, LatestSourceTimestampCacheEntry>();
const LATEST_SOURCE_TIMESTAMP_CACHE_TTL_MS = 30_000;

function fetchLatestPublicationTimestampDeduped(config: SupabaseRestConfig): Promise<number | null> {
  const key = `${config.url}::${config.anonKey}`;
  const now = Date.now();
  const existing = latestSourceTimestampCache.get(key);
  if (existing && (existing.resolvedAt === null || now - existing.resolvedAt < LATEST_SOURCE_TIMESTAMP_CACHE_TTL_MS)) {
    return existing.promise;
  }

  const promise = fetchLatestPublicationTimestamp(config);
  const entry: LatestSourceTimestampCacheEntry = { promise, resolvedAt: null };
  latestSourceTimestampCache.set(key, entry);
  promise.then(
    () => {
      entry.resolvedAt = Date.now();
    },
    () => {
      if (latestSourceTimestampCache.get(key) === entry) latestSourceTimestampCache.delete(key);
    }
  );
  return promise;
}

/**
 * A realtime publication event or foreground return means the 30-second
 * marker deduplication window must not hide a newly published version.
 */
export function invalidateLiveProductsPublicationMarker(config: SupabaseRestConfig): void {
  latestSourceTimestampCache.delete(`${config.url}::${config.anonKey}`);
}

async function fetchTargetedDealRow(
  config: SupabaseRestConfig,
  productId: string,
  storeId: string
): Promise<DodgyDealsRow | null> {
  const filters = `&product_id=eq.${encodeURIComponent(productId)}&store_id=eq.${encodeURIComponent(storeId)}&limit=1`;
  try {
    return await fetchFirstRow<DodgyDealsRow>(config, `${ENRICHED_SPECIALS_SELECT}${filters}`);
  } catch (err) {
    // Preserve the migration-window fallback used by the full catalogue
    // request. It is only a compatibility path; live v2 rows include the
    // evidence metadata needed for the final verdict.
    if (!(err instanceof Error) || !/HTTP 400/.test(err.message)) throw err;
    return fetchFirstRow<DodgyDealsRow>(config, `${LEGACY_SPECIALS_SELECT}${filters}`);
  }
}

/**
 * Fetches the small, exact product/store history needed by the deal page's
 * 90-day chart. `price_history` is changes-only storage, so the latest row
 * before the window is included as a carry-in state; without it, the chart
 * could incorrectly imply that the item had no price/special state at the
 * start of the 90 days.
 */
export async function fetchPriceHistory90d(
  config: SupabaseRestConfig,
  productId: string,
  storeId: string
): Promise<PriceHistoryPoint[]> {
  interface PriceHistoryRow {
    price: number | null;
    is_special: boolean | null;
    scraped_at: string | null;
  }
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const base =
    "price_history?select=price,is_special,scraped_at" +
    `&product_id=eq.${encodeURIComponent(productId)}` +
    `&store_id=eq.${encodeURIComponent(storeId)}`;
  const [carryIn, recent] = await Promise.all([
    fetchFirstRow<PriceHistoryRow>(config, `${base}&scraped_at=lt.${encodeURIComponent(start)}&order=scraped_at.desc&limit=1`),
    fetchAllRows<PriceHistoryRow>(
      config,
      `${base}&scraped_at=gte.${encodeURIComponent(start)}&order=scraped_at.asc`,
      1000
    ),
  ]);

  return [carryIn, ...recent]
    .filter((row): row is PriceHistoryRow => row != null && Number.isFinite(Number(row.price)) && !!row.scraped_at)
    .map((row) => ({
      price: Number(row.price),
      isSpecial: Boolean(row.is_special),
      scrapedAt: row.scraped_at as string,
    }));
}

/**
 * Revalidates one exact retailer product/store pair. Successful null results
 * are cached too, so a removed special cannot cause repeated requests while a
 * user navigates around the same detail page.
 */
export async function validateCurrentDeal(
  config: SupabaseRestConfig,
  productId: string,
  storeId: string
): Promise<CurrentDealValidationResult> {
  const key = `${config.url}::${productId}::${storeId}`;
  const existing = __targetedDealValidations.get(key);
  if (existing?.promise) return existing.promise;

  const now = Date.now();
  if (existing?.lastValidatedAt != null) {
    const elapsed = now - existing.lastValidatedAt;
    if (elapsed < TARGETED_DEAL_VALIDATION_COOLDOWN_MS) {
      return {
        row: existing.row,
        refreshed: false,
        throttled: true,
        retryAfterMs: TARGETED_DEAL_VALIDATION_COOLDOWN_MS - elapsed,
      };
    }
  }

  const entry: TargetedDealValidationEntry = existing ?? {
    promise: null,
    lastValidatedAt: null,
    row: null,
  };
  const promise = (async (): Promise<CurrentDealValidationResult> => {
    const row = await fetchTargetedDealRow(config, productId, storeId);
    entry.row = row;
    entry.lastValidatedAt = Date.now();
    return { row, refreshed: true, throttled: false, retryAfterMs: 0 };
  })();
  entry.promise = promise;
  __targetedDealValidations.set(key, entry);
  promise.then(
    () => {
      entry.promise = null;
    },
    () => {
      entry.promise = null;
      if (entry.lastValidatedAt === null && __targetedDealValidations.get(key) === entry) {
        __targetedDealValidations.delete(key);
      }
    }
  );
  return promise;
}

/** Applies a validated row to the cached catalogue without downloading it again. */
export function applyTargetedDealToProducts(
  products: ProductCard[],
  productId: string,
  storeId: string,
  row: DodgyDealsRow | null
): ProductCard[] {
  return products.flatMap((product) => {
    const dealIndex = product.currentDeals.findIndex(
      (deal) => deal.sourceProductId === productId && deal.sourceStoreId === storeId
    );
    if (dealIndex === -1) return [product];

    const nextDeals = [...product.currentDeals];
    if (row === null) nextDeals.splice(dealIndex, 1);
    else nextDeals[dealIndex] = currentDealFromRow(row);
    if (!nextDeals.length) return [];

    return [{
      ...product,
      standardPrice: Math.min(...nextDeals.map((deal) => deal.originalPrice)),
      currentDeals: nextDeals,
    }];
  });
}

async function fetchSpecialRows(config: SupabaseRestConfig): Promise<DodgyDealsRow[]> {
  try {
    return await fetchAllRows<DodgyDealsRow>(config, ENRICHED_SPECIALS_SELECT, 20000);
  } catch (err) {
    // Keep the catalogue usable during the brief migration window while the
    // materialized view is being rebuilt. The fallback deliberately carries
    // no evidence metadata, so it cannot pretend that old rows were judged by
    // classifier v2; the next cache refresh will populate the new contract.
    if (!(err instanceof Error) || !/HTTP 400/.test(err.message)) throw err;
    console.warn("Evidence-aware deal fields are not live yet; using the legacy cache shape.");
    return fetchAllRows<DodgyDealsRow>(config, LEGACY_SPECIALS_SELECT, 20000);
  }
}

/** Exported for tests only, not part of the public API surface. */
export const __liveProductsCache = new Map<string, LiveProductsCacheEntry>();

/**
 * 2026-08-08: added after real production 500s were traced (via Supabase's
 * own API + Postgres logs, not guessed) to `canceling statement due to
 * statement timeout` cascades on `dodgy_deals`/`products`/
 * `app_comparable_family_links`, all clustered in one burst of concurrent
 * paginated requests. Root cause: `loadLiveProducts()` fires a full
 * multi-page fetch pipeline (this table's paginated rows + the separate
 * `buildMatchIndex()` paginated fetches) EVERY time it's called, and once
 * both Home and Specials called it independently on the same load (plus
 * React Strict Mode double-invoking effects in dev), several full pipelines
 * ran concurrently against the same free-tier Postgres instance.
 *
 * Fix: a short-TTL, in-memory, per-`(url, anonKey)` cache of the *promise*
 * itself, not just the resolved value -- so callers that overlap while a
 * fetch is still in flight (the exact failure pattern observed) share that
 * one in-flight request instead of each starting their own. `TTL = 30s`:
 * long enough to collapse simultaneous mounts/tab-switches/Strict-Mode
 * double-invokes into one fetch, short enough that this stays a
 * reliability fix, not a second stale-data layer -- the specials dataset
 * only changes via the nightly scrape, so 30s of staleness is
 * imperceptible, and this is explicitly NOT the persistent
 * cross-session IndexedDB cache flagged as a follow-up elsewhere in this
 * file's top comment (that's still not built; this is a narrower,
 * session-lifetime request dedup aimed specifically at the measured
 * concurrency bug, not a general caching layer).
 *
 * A failed fetch is never cached (removed from the map in the `.catch`
 * below) so a real outage doesn't get "cached" as permanently broken --
 * the next caller gets a clean retry.
 */
const LIVE_PRODUCTS_CACHE_TTL_MS = 30_000;

/**
 * Full catalogue refreshes are intentionally rate-limited. A pull gesture is
 * user initiated, but it must not turn into an unbounded multi-page Supabase
 * download when somebody repeatedly pulls the screen. The timestamp is also
 * persisted in the IndexedDB catalogue record, so reloads and extra tabs get
 * the same protection.
 */
export const LIVE_PRODUCTS_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export interface RefreshLiveProductsResult {
  products: ProductCard[];
  refreshed: boolean;
  throttled: boolean;
  retryAfterMs: number;
}

interface RefreshLiveProductsEntry {
  promise: Promise<RefreshLiveProductsResult> | null;
  lastSuccessfulRefreshAt: number | null;
  products: ProductCard[] | null;
}

/** Exported for tests only, not part of the public API surface. */
export const __liveProductsRefreshes = new Map<string, RefreshLiveProductsEntry>();

const LIVE_PRODUCTS_AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;

function loadLiveProductsDeduped(
  config: SupabaseRestConfig,
  forceRefresh = false
): Promise<LiveProductsLoadResult> {
  const cacheKey = `${config.url}::${config.anonKey}`;
  const now = Date.now();
  const cached = __liveProductsCache.get(cacheKey);
  if (cached && cached.resolvedAt === null) return cached.promise;
  if (!forceRefresh && cached && now - (cached.resolvedAt ?? 0) < LIVE_PRODUCTS_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = loadLiveProductsUncached(config);
  const entry: LiveProductsCacheEntry = { promise, resolvedAt: null };
  __liveProductsCache.set(cacheKey, entry);
  promise.then(
    () => {
      entry.resolvedAt = Date.now();
    },
    () => {
      // Don't cache failures -- only evict if this is still the current
      // entry for the key (a newer call may have already replaced it).
      if (__liveProductsCache.get(cacheKey) === entry) __liveProductsCache.delete(cacheKey);
    }
  );
  return promise;
}

/**
 * 2026-08-08: layered on top of the in-memory dedup above after Jay asked
 * specifically about egress efficiency -- checks the persistent, cross-
 * session IndexedDB cache (`catalogue-cache.ts`, a direct port of
 * `Prototype/index.html`'s own egress fix) FIRST. A warm hit (same
 * browser, within its 6-hour TTL) skips the full catalogue network fetch when
 * the cheap published-cache timestamp has not advanced --
 * `dodgy_deals` AND `buildMatchIndex()`'s two paginated fetches, not just
 * one of them. Only on a miss does this fall through to the in-memory
 * dedup + real network fetch, then best-effort writes the result back to
 * IndexedDB for the next load. The write is NOT awaited (matches the
 * prototype's own fire-and-forget pattern) -- `writeCatalogueCache` never
 * throws, so there's nothing useful to await for.
 *
 * This is every current caller of live specials data in apps/mobile
 * (Home and Specials both call this one function, nothing calls
 * `loadLiveProductsUncached`/`loadLiveProductsDeduped` directly) -- fixing
 * it here covers every page, not just the two that exist today.
 */
export async function loadLiveProducts(config: SupabaseRestConfig): Promise<ProductCard[]> {
  const cached = await readCatalogueCache();
  let markerAdvanced = false;
  if (cached) {
    const metadata = await readCatalogueCacheMetadata();
    const latestSourceUpdatedAt = await fetchLatestPublicationTimestampDeduped(config);
    // Unknown freshness is fail-safe: keep the last good catalogue and let
    // the next foreground check or normal TTL expiry retry the marker query.
    // A legacy record without a marker is treated as older than any known
    // server marker, so deploying this contract cannot leave old browsers
    // pinned to stale data for the remainder of the six-hour display TTL.
    if (latestSourceUpdatedAt === null || latestSourceUpdatedAt <= (metadata?.sourceUpdatedAt ?? 0)) {
      return cached;
    }
    markerAdvanced = true;
  }

  const fresh = await loadLiveProductsDeduped(config, markerAdvanced);
  const sourceUpdatedAt = fresh.products.length
    ? (await fetchLatestPublicationTimestampDeduped(config)) ?? fresh.sourceUpdatedAt
    : fresh.sourceUpdatedAt;
  if (fresh.products.length) writeCatalogueCache(fresh.products, sourceUpdatedAt);
  return fresh.products;
}

/** Returns true when an automatic six-hour refresh is due, without making a network request. */
export async function isLiveProductsRefreshDue(): Promise<boolean> {
  const metadata = await readCatalogueCacheMetadata();
  if (!metadata) return true;
  return Date.now() - metadata.savedAt >= LIVE_PRODUCTS_AUTO_REFRESH_MS;
}

/**
 * Bypasses the normal cache, but not the shared request/cooldown guards, and
 * fetches the latest catalogue. A throttled call returns the current cache so
 * the caller can update its screen without spending egress.
 */
export async function refreshLiveProducts(config: SupabaseRestConfig): Promise<RefreshLiveProductsResult> {
  const cacheKey = `${config.url}::${config.anonKey}`;
  const existing = __liveProductsRefreshes.get(cacheKey);
  if (existing?.promise) return existing.promise;

  const entry: RefreshLiveProductsEntry = {
    promise: null,
    lastSuccessfulRefreshAt: existing?.lastSuccessfulRefreshAt ?? null,
    products: existing?.products ?? null,
  };
  __liveProductsRefreshes.set(cacheKey, entry);
  invalidateLiveProductsPublicationMarker(config);

  const promise = (async (): Promise<RefreshLiveProductsResult> => {
    const metadata = await readCatalogueCacheMetadata();
    const inMemoryLast = entry.lastSuccessfulRefreshAt;
    const lastSuccessfulRefreshAt = Math.max(metadata?.savedAt ?? 0, inMemoryLast ?? 0) || null;
    const elapsed = lastSuccessfulRefreshAt === null ? Infinity : Date.now() - lastSuccessfulRefreshAt;

    if (elapsed < LIVE_PRODUCTS_REFRESH_COOLDOWN_MS) {
      const cached = await readCatalogueCache();
      return {
        // Empty is preferable to breaking the egress promise. In normal use
        // this is populated by IndexedDB or the in-memory fallback; it only
        // occurs when storage was evicted between two pull gestures.
        products: cached ?? entry.products ?? [],
        refreshed: false,
        throttled: true,
        retryAfterMs: LIVE_PRODUCTS_REFRESH_COOLDOWN_MS - elapsed,
      };
    }

    const fresh = await loadLiveProductsDeduped(config, true);
    const sourceUpdatedAt = fresh.products.length
      ? (await fetchLatestPublicationTimestampDeduped(config)) ?? fresh.sourceUpdatedAt
      : fresh.sourceUpdatedAt;
    if (fresh.products.length) await writeCatalogueCache(fresh.products, sourceUpdatedAt);
    else await writeCatalogueCacheMetadata(Date.now(), sourceUpdatedAt);
    const refreshEntry = __liveProductsRefreshes.get(cacheKey);
    if (refreshEntry) {
      refreshEntry.lastSuccessfulRefreshAt = Date.now();
      refreshEntry.products = fresh.products;
    }
    return { products: fresh.products, refreshed: true, throttled: false, retryAfterMs: 0 };
  })();

  entry.promise = promise;
  promise.then(
    () => {
      entry.promise = null;
    },
    () => {
      if (__liveProductsRefreshes.get(cacheKey) === entry) __liveProductsRefreshes.delete(cacheKey);
    }
  );
  return promise;
}

export { LIVE_PRODUCTS_AUTO_REFRESH_MS };

interface CurrentPriceRow {
  product_id: string;
  store_id: string;
  price: number;
}

interface ProductRow {
  id: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  unit_size: string | null;
}

/**
 * Small on-demand lookup for products NOT covered by the specials-only
 * dataset (e.g. tracked/list items that have rolled off special). No
 * `price_history` involved. Builds the same 'Fair Price'/non-special card
 * shape `buildProductCardsFromSpecials` produces for regular-priced rows,
 * fetched lazily for a specific handful of ids instead of eagerly for the
 * whole catalogue. Simplification carried over from the source: looks up
 * each id as its own single-store card rather than reconstructing its full
 * original cross-store match group.
 */
export async function fetchNonSpecialProductCards(
  config: SupabaseRestConfig,
  productIds: string[]
): Promise<ProductCard[]> {
  const ids = [...new Set(productIds)].filter(Boolean);
  if (!ids.length) return [];
  const [priceRows, productRows] = await Promise.all([
    fetchByIds<CurrentPriceRow>(config, "current_prices", "product_id", "product_id,store_id,price", ids),
    fetchByIds<ProductRow>(config, "products", "id", "id,name,brand,category,image_url,unit_size", ids),
  ]);
  const productById = new Map(productRows.map((p) => [p.id, p]));

  return priceRows
    .map((row): ProductCard | null => {
      const meta = productById.get(row.product_id);
      if (!meta || !meta.name) return null;
      return {
        id: row.product_id,
        brand: titleCase(meta.brand) || "Unbranded",
        name: titleCase(meta.name),
        category: meta.category || "Grocery",
        image: meta.image_url || FALLBACK_PRODUCT_IMAGE,
        standardPrice: row.price,
        unit: meta.unit_size || "",
        currentDeals: [
          {
            sourceProductId: row.product_id,
            sourceStoreId: row.store_id,
            store: STORE_DISPLAY_FALLBACK[row.store_id] || titleCase(row.store_id),
            price: row.price,
            originalPrice: row.price,
            discountPercentage: 0,
            dealType: "Fair Price",
            wasArtificiallyInflated: false,
            reason: "Regular Price",
            explanation: "Not currently on special -- this is the regular shelf price.",
            isOnSpecial: false,
            saleStartedAt: null,
            specialEndDate: null,
            // No dodgy_deals row backs this card (see this function's own
            // doc comment -- it's a current_prices/products lookup only),
            // so there's no real 90-day stat to report -- null, not
            // fabricated, same as every other "not enough data" case.
            ninetyDayLow: null,
            ninetyDayHigh: null,
            ninetyDayAvg: null,
            ninetyDaySamples: null,
            ninetyDaySpecialSamples: null,
            ninetyDayDaysTracked: null,
            ninetyDaySpecialDays: null,
          },
        ],
        priceHistory: [],
        description: "",
      };
    })
    .filter((p): p is ProductCard => p !== null);
}

/** Store pill filter, ported from the prototype's normalizeStoreKey/storeMatchesFilter. */
export const normalizeStoreKey = (s: string | null | undefined): string =>
  (s || "").toLowerCase().replace(/[^a-z]/g, "");

export const storeMatchesFilter = (storeName: string, filter: string): boolean =>
  filter === "all" || normalizeStoreKey(storeName).includes(filter);

/**
 * Multi-select version of `storeMatchesFilter` -- true if `storeName`
 * matches ANY of the selected filters (or `selectedStores` includes "all").
 * Extracted here 2026-08-21, per Jay's ask to let users select multiple
 * supermarket pills at once, not just one, on the "Check deals" (Home) and
 * search pages -- `FullScreenSearch.tsx`'s own multi-select toggle already
 * had this exact function defined locally (added 2026-08-10 for that
 * screen's own store-pill row); Home's own pill row was still single-select
 * (`storeFilter: string`) until this same ask. Rather than write a second,
 * page-local copy of the same 2-line function for Home (this codebase's own
 * established "kept in sync" convention flags exactly this kind of
 * near-duplicate as the next drift waiting to happen -- see e.g.
 * `SearchBar.tsx`'s own doc comment on `blurred`/`variant`), promoted the
 * ONE existing implementation here next to `storeMatchesFilter` itself and
 * pointed both call sites at it -- `FullScreenSearch.tsx`'s local copy
 * removed, its import list extended instead.
 */
export const matchesAnySelectedStore = (storeName: string, selectedStores: string[]): boolean =>
  selectedStores.includes("all") || selectedStores.some((filter) => storeMatchesFilter(storeName, filter));

/**
 * Canonical store-pill order + "which of these are actually present in this
 * product list" — extracted (2026-08-09, full-screen search session) from
 * page.tsx's own inline `availableStoreKeys` memo (2026-08-09 Woolworths
 * pill-visibility fix, see project.md) so `/specials`, Home, and the new
 * full-screen search view share one copy instead of three separately
 * drifting ones. Substring match (`.includes`), NOT exact `.has()` — the DB
 * stores Woolworths' deals under "Woolworths NZ" (confirmed live via
 * `execute_sql`, 2026-08-09), which `normalizeStoreKey` turns into
 * "woolworthsnz", not "woolworths". Doing this extraction surfaced that
 * `specials/page.tsx`'s own pre-existing `present.has(key)` check had
 * exactly this exact-match bug independently (never fixed alongside Home's
 * own version of it) — its Woolworths filter pill was silently missing
 * there too until this refactor folded it into the shared, substring-
 * matching version.
 */
export const STORE_PILL_ORDER = ["newworld", "paknsave", "woolworths", "foursquare", "supervalue"];

export function deriveAvailableStoreKeys(
  products: ProductCard[],
  order: string[] = STORE_PILL_ORDER
): string[] {
  const present = new Set<string>();
  for (const product of products) {
    for (const deal of product.currentDeals) present.add(normalizeStoreKey(deal.store));
  }
  return order.filter((key) => [...present].some((p) => p.includes(key)));
}
