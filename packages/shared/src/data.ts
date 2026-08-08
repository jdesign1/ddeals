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

import { readCatalogueCache, writeCatalogueCache } from "./catalogue-cache.ts";

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
  verdict: "DODGY" | "GENUINE" | "MARGINAL" | "UNKNOWN";
  reason: string | null;
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
  UNKNOWN: "Not Enough History",
};

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
  path: string
): Promise<T[]> {
  const page = 1000;
  const MAX_PAGES = 100; // safety cap: 100k rows

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
    if (ra !== rb) parent.set(ra, rb);
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

    const currentDeals: CurrentDeal[] = rows.map((row) => ({
      store: row.store_name || STORE_DISPLAY_FALLBACK[row.store_id] || titleCase(row.store_id),
      price: row.sale_price,
      originalPrice: row.normal_price ?? row.was_price ?? row.sale_price,
      discountPercentage: Math.max(0, Math.round(row.saving_pct ?? 0)),
      dealType:
        row.verdict === "UNKNOWN" ? "Unverified Deal" : VIEW_VERDICT_TO_DEAL_TYPE[row.verdict],
      wasArtificiallyInflated: row.verdict === "DODGY",
      reason: VIEW_VERDICT_SHORT_REASON[row.verdict] || "Standard Special",
      explanation: row.reason,
      isOnSpecial: true,
      saleStartedAt: row.sale_started_at || null,
      specialEndDate: row.special_end_date || null,
    }));

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
 * full-catalogue browsing. Sourced entirely from the `dodgy_deals` view,
 * grouped into real cross-store match groups via the union-find matchIndex.
 */
async function loadLiveProductsUncached(config: SupabaseRestConfig): Promise<ProductCard[]> {
  const [specialRows, matchIndex] = await Promise.all([
    fetchAllRows<DodgyDealsRow>(
      config,
      "dodgy_deals?select=product_id,store_id,product_name,brand,category,store_name,sale_price,normal_price,saving_pct,special_label,was_price,special_end_date,image_url,unit_size,sale_started_at,verdict,reason"
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
