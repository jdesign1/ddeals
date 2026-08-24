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
import { MATERIAL_OVER_NORMAL_THRESHOLD } from "./classify.ts";

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
}

export interface CurrentDeal {
  store: string;
  price: number;
  originalPrice: number;
  discountPercentage: number;
  dealType: "Dodgy Deal" | "Real Deal" | "Fair Price" | "Unverified Deal";
  wasArtificiallyInflated: boolean;
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
 * Applies the new materiality floor to legacy cache rows until the upstream
 * view/cache producer is regenerated. Older rows called every equal-or-higher
 * price Dodgy; rows that are now equal, lower, or within the 5% tolerance are
 * Fair unless their reason carries an independent unit-price or repeated-lift
 * signal. This keeps a current client from showing the old false-positive
 * verdict while the backend source is rolled forward.
 */
function effectiveViewVerdict(row: DodgyDealsRow): DodgyDealsRow["verdict"] {
  if (row.verdict !== "DODGY" || row.normal_price == null || row.normal_price <= 0) return row.verdict;

  const reason = (row.reason || "").toLowerCase();
  const hasIndependentDodgySignal = /pack size|unit price|raised|inflated|pump/.test(reason);
  const increasePct = ((row.sale_price - row.normal_price) / row.normal_price) * 100;

  if (!hasIndependentDodgySignal && increasePct <= MATERIAL_OVER_NORMAL_THRESHOLD) return "MARGINAL";
  return row.verdict;
}

export const titleCase = (s: string | null | undefined): string =>
  (s || "").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * PostgREST caps responses (commonly 1000 rows) regardless of ?limit=, so
 * anything that can exceed that must be paged with the Range header. Fetches
 * page 1 with `Prefer: count=exact` to learn the true row count from the
 * `Content-Range` response header, then fires every remaining page in
 * parallel.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  config: SupabaseRestConfig,
  path: string,
  pageSize = 1000
): Promise<T[]> {
  const page = pageSize;
  const MAX_PAGES = 100; // safety cap: MAX_PAGES * pageSize rows (100k at the default 1000/page)

  const fetchPage = async (start: number, extraHeaders?: Record<string, string>) => {
    const res = await fetch(`${config.url}/rest/v1/${path}`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Range-Unit": "items",
        Range: `${start}-${start + page - 1}`,
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return res;
  };

  const firstRes = await fetchPage(0, { Prefer: "count=exact" });
  const firstData = (await firstRes.json()) as T[];
  const contentRange = firstRes.headers.get("content-range"); // e.g. "0-999/12702"
  const total =
    contentRange && contentRange.includes("/") ? parseInt(contentRange.split("/")[1], 10) : NaN;

  if (!Number.isFinite(total) || firstData.length < page) {
    return firstData; // no exact count available, or that one page was everything
  }

  const remainingPages = Math.min(Math.ceil((total - page) / page), MAX_PAGES - 1);
  const restResponses = await Promise.all(
    Array.from({ length: remainingPages }, (_, i) => fetchPage(page * (i + 1)))
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

    const currentDeals: CurrentDeal[] = rows.map((row) => {
      const verdict = effectiveViewVerdict(row);
      return ({
      store: row.store_name || STORE_DISPLAY_FALLBACK[row.store_id] || titleCase(row.store_id),
      price: row.sale_price,
      originalPrice: row.normal_price ?? row.was_price ?? row.sale_price,
      discountPercentage: Math.max(0, Math.round(row.saving_pct ?? 0)),
      dealType:
        verdict === "UNKNOWN" ? "Unverified Deal" : VIEW_VERDICT_TO_DEAL_TYPE[verdict],
      wasArtificiallyInflated: verdict === "DODGY",
      reason: VIEW_VERDICT_SHORT_REASON[verdict] || "Standard Special",
      explanation: row.reason,
      isOnSpecial: true,
      saleStartedAt: row.sale_started_at || null,
      specialEndDate: row.special_end_date || null,
      productUrl: row.product_url ?? null,
      // Price History Insights (2026-08-19) -- `?? null` not `|| null`:
      // 0 is a real, meaningful value for ninetyDaySpecialSamples ("never
      // on special"), and `||` would wrongly coerce it to null. Comes back
      // `undefined` (not present on the row) when the view hasn't shipped
      // these columns yet or the migration hasn't been applied -- `?? null`
      // normalizes that the same way as an explicit NULL from Postgres, so
      // callers only ever see `number | null`, never `undefined`.
      ninetyDayLow: row.price_history_90d_low ?? null,
      ninetyDayHigh: row.price_history_90d_high ?? null,
      ninetyDayAvg: row.price_history_90d_avg ?? null,
      ninetyDaySamples: row.price_history_90d_samples ?? null,
      ninetyDaySpecialSamples: row.price_history_90d_special_samples ?? null,
      // `?? null` not `|| null` -- same reasoning as above: 0 is real for
      // ninetyDaySpecialDays ("never discounted"), and `undefined` (column
      // not yet shipped/migrated) normalizes to null either way.
      ninetyDayDaysTracked: row.price_history_90d_days_tracked ?? null,
      ninetyDaySpecialDays: row.price_history_90d_special_days ?? null,
      });
    });

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
async function loadLiveProductsUncached(config: SupabaseRestConfig): Promise<ProductCard[]> {
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
    fetchAllRows<DodgyDealsRow>(
      config,
      "dodgy_deals_cache?select=product_id,store_id,product_name,brand,category,store_name,sale_price,normal_price,saving_pct,special_label,was_price,special_end_date,image_url,unit_size,sale_started_at,product_url,verdict,reason,price_history_90d_low,price_history_90d_high,price_history_90d_avg,price_history_90d_samples,price_history_90d_special_samples,price_history_90d_days_tracked,price_history_90d_special_days",
      20000
    ),
    buildMatchIndex(config),
  ]);
  if (!specialRows.length) return [];

  const byGroup = new Map<string, DodgyDealsRow[]>();
  for (const row of specialRows) {
    const groupId = matchIndex.find(row.product_id);
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId)!.push(row);
  }

  return buildProductCardsFromSpecials([...byGroup.entries()]);
}

interface LiveProductsCacheEntry {
  promise: Promise<ProductCard[]>;
  resolvedAt: number | null;
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

function loadLiveProductsDeduped(config: SupabaseRestConfig): Promise<ProductCard[]> {
  const cacheKey = `${config.url}::${config.anonKey}`;
  const now = Date.now();
  const cached = __liveProductsCache.get(cacheKey);
  if (cached && (cached.resolvedAt === null || now - cached.resolvedAt < LIVE_PRODUCTS_CACHE_TTL_MS)) {
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
 * browser, within its 1-hour TTL) skips the network fetch entirely --
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
  if (cached) return cached;

  const fresh = await loadLiveProductsDeduped(config);
  if (fresh.length) writeCatalogueCache(fresh);
  return fresh;
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

    const fresh = await loadLiveProductsDeduped(config);
    if (fresh.length) await writeCatalogueCache(fresh);
    else await writeCatalogueCacheMetadata();
    const refreshEntry = __liveProductsRefreshes.get(cacheKey);
    if (refreshEntry) {
      refreshEntry.lastSuccessfulRefreshAt = Date.now();
      refreshEntry.products = fresh;
    }
    return { products: fresh, refreshed: true, throttled: false, retryAfterMs: 0 };
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
