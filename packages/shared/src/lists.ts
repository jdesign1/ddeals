import type { SupabaseClient } from "./supabase.ts";
import {
  fetchByIds,
  STORE_DISPLAY_FALLBACK,
  titleCase,
  FALLBACK_PRODUCT_IMAGE,
  VIEW_VERDICT_TO_DEAL_TYPE,
  type SupabaseRestConfig,
  type ProductCard,
  type CurrentDeal,
} from "./data.ts";

/**
 * Real, persisted shopping lists — backs S1 "My Lists" (project.md Stitch
 * inventory). Schema: /migrations/20260808_lists_and_list_items.sql.
 *
 * Deliberately uses `@supabase/supabase-js` (via `createSupabaseClient` in
 * ./supabase.ts) for these functions, NOT the raw-fetch `fetchAllRows`/
 * `fetchByIds` pattern `data.ts` uses for the public catalogue reads. That
 * pattern exists there to port the prototype's proven read path 1:1; writes
 * here are new, RLS-gated, and need a signed-in user's JWT attached to every
 * request, which is exactly what an authenticated supabase-js client does
 * for you (session storage, refresh, `Authorization` header) — reimplementing
 * that by hand over raw fetch would just be redoing what the library exists
 * for. Summary computation below (public current_prices/dodgy_deals reads,
 * no auth required) DOES use the existing fetchByIds pattern, for
 * consistency with the rest of the public read path.
 */

export interface ListRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ListItemRow {
  id: string;
  list_id: string;
  product_id: string;
  quantity: number;
  added_at: string;
}

/** Browser event name used to invalidate Home's My List rail after a list
 * item/list mutation completes in another mounted component. */
export const LIST_MEMBERSHIP_CHANGED_EVENT = "dodgey-deals:list-membership-changed";

export async function fetchUserLists(client: SupabaseClient): Promise<ListRow[]> {
  const { data, error } = await client
    .from("lists")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`fetchUserLists: ${error.message}`);
  return (data as ListRow[]) ?? [];
}

/**
 * List creation, simplified: name only. The full S2/S6 "Create New List"
 * modal (store selection, import shortcuts, price-alerts toggle) is not
 * built this session — this is the minimum needed to make S1 real rather
 * than perpetually empty. `userId` must be the caller's own
 * `auth.uid()`; RLS's `WITH CHECK (auth.uid() = user_id)` rejects anything
 * else regardless, this is just for a clean error path client-side.
 */
export async function createList(
  client: SupabaseClient,
  userId: string,
  name: string
): Promise<ListRow> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("createList: list name is required");
  const { data, error } = await client
    .from("lists")
    .insert({ user_id: userId, name: trimmed })
    .select()
    .single();
  if (error) throw new Error(`createList: ${error.message}`);
  return data as ListRow;
}

export async function deleteList(client: SupabaseClient, listId: string): Promise<void> {
  const { error } = await client.from("lists").delete().eq("id", listId);
  if (error) throw new Error(`deleteList: ${error.message}`);
}

/**
 * Renames an existing list (2026-08-15, Jay: "allow lists to be edited").
 * lists.ts previously had no update path at all -- only create/delete.
 * Assumes `lists`' RLS covers UPDATE the same way it already covers INSERT/
 * DELETE (both scoped to `auth.uid() = user_id`, per this file's own
 * `createList` comment) -- couldn't confirm this against the live schema
 * this session (no DB access from this environment), so flagged here
 * rather than silently assumed solid: if a real rename ever fails with an
 * RLS-shaped error, the fix is a `USING (auth.uid() = user_id)` UPDATE
 * policy on `lists`, not a bug in this function.
 */
export async function updateListName(
  client: SupabaseClient,
  listId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("updateListName: list name is required");
  // `.select().single()` (peer review catch, 2026-08-15) -- without it, a
  // 0-row update (e.g. RLS silently blocking the UPDATE the doc comment
  // above already worried about, or a stale/already-deleted `listId`)
  // still comes back with no `error`, since PostgREST's plain UPDATE
  // response doesn't fail just because it matched nothing. `createList`
  // above already selects its inserted row back for the same reason.
  // `.single()` turns "0 rows" into a real thrown error here instead of a
  // silent no-op that `saveName()` (lists/page.tsx) would otherwise treat
  // as a successful rename.
  const { error } = await client.from("lists").update({ name: trimmed }).eq("id", listId).select().single();
  if (error) throw new Error(`updateListName: ${error.message}`);
}

export async function fetchListItems(
  client: SupabaseClient,
  listId: string
): Promise<ListItemRow[]> {
  const { data, error } = await client
    .from("list_items")
    .select("*")
    .eq("list_id", listId);
  if (error) throw new Error(`fetchListItems: ${error.message}`);
  return (data as ListItemRow[]) ?? [];
}

/** All items across all of the caller's lists in one round trip, for the S1 grid's per-card summaries. */
export async function fetchItemsForLists(
  client: SupabaseClient,
  listIds: string[]
): Promise<ListItemRow[]> {
  if (!listIds.length) return [];
  const { data, error } = await client.from("list_items").select("*").in("list_id", listIds);
  if (error) throw new Error(`fetchItemsForLists: ${error.message}`);
  return (data as ListItemRow[]) ?? [];
}

/**
 * Adds a product to a list. `onConflict` matches the `UNIQUE(list_id,
 * product_id)` constraint — re-adding an already-listed product bumps its
 * quantity instead of erroring or duplicating a row.
 */
export async function addItemToList(
  client: SupabaseClient,
  listId: string,
  productId: string,
  quantity = 1
): Promise<ListItemRow> {
  const { data, error } = await client
    .from("list_items")
    .upsert(
      { list_id: listId, product_id: productId, quantity },
      { onConflict: "list_id,product_id" }
    )
    .select()
    .single();
  if (error) throw new Error(`addItemToList: ${error.message}`);
  return data as ListItemRow;
}

export async function removeItemFromList(
  client: SupabaseClient,
  listId: string,
  productId: string
): Promise<void> {
  const { error } = await client
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .eq("product_id", productId);
  if (error) throw new Error(`removeItemFromList: ${error.message}`);
}

/**
 * List IDs (among the caller's own lists) that already contain this
 * product -- added 2026-08-20 for `AddToListButton.tsx`'s own "already
 * saved" state (per Jay: "Items already on your list should show a
 * ticked icon on their product cards, not an Add icon"), which needs to
 * know a product's list membership up front, not just track adds made
 * during the current button session the way its `addedTo` state used to.
 *
 * A plain `.eq("product_id", ...)` against `list_items` with no explicit
 * `list_id` filter, relying on `list_items_select_own`'s RLS policy
 * (migrations/20260808_lists_and_list_items.sql) to scope the result to
 * only rows whose `list_id` belongs to a list this caller owns -- the
 * same trust-RLS-not-a-client-side-filter pattern every other list_items
 * read in this file already uses (`fetchListItems`/`fetchItemsForLists`
 * both trust their own `list_id`/`in("list_id", ...)` filters combined
 * with that same policy, not an extra `user_id` check here). An
 * unauthenticated/anon-key call gets zero rows by construction either way
 * (that policy's own comment: `auth.uid()` is NULL for anon, `NULL =
 * user_id` is never true) -- not this function's concern to re-guard.
 */
export async function fetchListIdsContainingProduct(
  client: SupabaseClient,
  productId: string
): Promise<string[]> {
  const { data, error } = await client.from("list_items").select("list_id").eq("product_id", productId);
  if (error) throw new Error(`fetchListIdsContainingProduct: ${error.message}`);
  return ((data as { list_id: string }[]) ?? []).map((row) => row.list_id);
}

interface CurrentPriceLookupRow {
  product_id: string;
  store_id: string;
  price: number;
  is_special: boolean | null;
}

interface DodgyDealsLookupRow {
  product_id: string;
  store_id: string;
  verdict: "DODGY" | "GENUINE" | "MARGINAL" | "UNKNOWN";
  normal_price: number | null;
}

export interface ListSummary {
  itemCount: number;
  /** Sum of each item's cheapest current price (quantity-weighted), across any store. Null only for an empty list. */
  totalPrice: number | null;
  /**
   * The single store that could fill the ENTIRE list, if one exists — only
   * populated when every item in the list has a current price at that
   * store. Real multi-category lists routinely have no such store; rather
   * than show a misleading "best store" computed from partial coverage,
   * this is left null and the S1 card omits the chip. Historic Low label
   * and the Retailer Synergy/savings-goal cards from the Stitch mock are
   * NOT computed here — deferred, see project.md, not faked.
   */
  bestPriceStore: { store: string; total: number } | null;
  /** True if paying the badge's `savingsAmount` would need `savingsAmount > 0` to be shown, false = show "CHECKING PRICES…" per the Stitch spec's own two-state badge. */
  hasSavingsData: boolean;
  savingsAmount: number;
  /** True if at least one item's cheapest current price is a real (non-DODGY, non-UNKNOWN) verified special. */
  hasVerifiedSpecial: boolean;
}

const EMPTY_SUMMARY: ListSummary = {
  itemCount: 0,
  totalPrice: null,
  bestPriceStore: null,
  hasSavingsData: false,
  savingsAmount: 0,
  hasVerifiedSpecial: false,
};

/**
 * Shared price/deal lookups for one or more lists' worth of product ids.
 * Split out from `computeListSummary` (2026-08-08, egress pass) so a
 * caller with MULTIPLE lists -- like S1's own list grid -- can fetch this
 * ONCE for the union of every list's product ids instead of once per list.
 * Before this split, a user with N lists that shared even one product
 * triggered N separate `current_prices`/`dodgy_deals` round trips that
 * re-fetched overlapping rows -- real, avoidable egress on a free-tier
 * project, and pure waste since the data doesn't differ per list.
 */
export interface ListPriceLookups {
  cheapestByProduct: Map<string, CurrentPriceLookupRow>;
  /** Cheapest currently-special price per product, when any store has one. */
  specialByProduct?: Map<string, CurrentPriceLookupRow>;
  dealByProductStore: Map<string, DodgyDealsLookupRow>;
  storesByProduct: Map<string, Set<string>>;
  priceAtStore: Map<string, number>;
  allStoreIds: Set<string>;
}

const EMPTY_LOOKUPS: ListPriceLookups = {
  cheapestByProduct: new Map(),
  specialByProduct: new Map(),
  dealByProductStore: new Map(),
  storesByProduct: new Map(),
  priceAtStore: new Map(),
  allStoreIds: new Set(),
};

export async function fetchListPriceLookups(
  config: SupabaseRestConfig,
  productIds: string[]
): Promise<ListPriceLookups> {
  const ids = [...new Set(productIds)];
  if (!ids.length) return EMPTY_LOOKUPS;

  const [priceRows, dealRows] = await Promise.all([
    fetchByIds<CurrentPriceLookupRow>(config, "current_prices", "product_id", "product_id,store_id,price,is_special", ids),
    // 2026-08-12 (peer review, "efficiency deep dive" session): was
    // "dodgy_deals" (the live, non-materialized view) -- caught as a real
    // remaining gap after that session's dodgy_deals_cache fix, because
    // this ?product_id=in.(...) filter almost certainly can't be pushed
    // down into the view's CTEs (pre_sale/sale_start are each referenced
    // 2+ times downstream, so Postgres materializes them rather than
    // inlining -- the filter can only apply to the CTEs' already-computed
    // output, not narrow what they scan). Every Lists-page load was still
    // paying the view's full ~0.5-3.4s+ cost regardless of how few product
    // ids were actually requested. Repointed to dodgy_deals_cache (same
    // columns, refreshed every 15 min via pg_cron) -- see
    // dodgy_deals_cache.sql for the full writeup.
    fetchByIds<DodgyDealsLookupRow>(config, "dodgy_deals_cache", "product_id", "product_id,store_id,verdict,normal_price", ids),
  ]);

  // Cheapest current price per product, across any store.
  const cheapestByProduct = new Map<string, CurrentPriceLookupRow>();
  for (const row of priceRows) {
    const existing = cheapestByProduct.get(row.product_id);
    if (!existing || row.price < existing.price) cheapestByProduct.set(row.product_id, row);
  }

  // A list item's deal availability must match the same live deal source the
  // deal-assessment page uses. `current_prices.is_special` alone can be stale
  // or orphaned after a deal drops out of `dodgy_deals_cache`.
  const dealByProductStore = new Map<string, DodgyDealsLookupRow>();
  for (const row of dealRows) dealByProductStore.set(`${row.product_id}:${row.store_id}`, row);

  // Prefer the cheapest price that has both a current special flag and a
  // matching live deal row. This keeps valid specials at other stores active,
  // while grey-ing products whose only special flag is stale/orphaned.
  const specialByProduct = new Map<string, CurrentPriceLookupRow>();
  for (const row of priceRows) {
    if (!row.is_special || !dealByProductStore.has(`${row.product_id}:${row.store_id}`)) continue;
    const existingSpecial = specialByProduct.get(row.product_id);
    if (!existingSpecial || row.price < existingSpecial.price) specialByProduct.set(row.product_id, row);
  }

  const storesByProduct = new Map<string, Set<string>>();
  const priceAtStore = new Map<string, number>(); // `${productId}:${storeId}` -> price
  for (const row of priceRows) {
    if (!storesByProduct.has(row.product_id)) storesByProduct.set(row.product_id, new Set());
    storesByProduct.get(row.product_id)!.add(row.store_id);
    priceAtStore.set(`${row.product_id}:${row.store_id}`, row.price);
  }
  const allStoreIds = new Set(priceRows.map((r) => r.store_id));

  return { cheapestByProduct, specialByProduct, dealByProductStore, storesByProduct, priceAtStore, allStoreIds };
}

/** Pure -- no network calls -- computes one list's summary from lookups already fetched (possibly shared across several lists via `fetchListPriceLookups`). */
export function computeListSummaryFromLookups(items: ListItemRow[], lookups: ListPriceLookups): ListSummary {
  if (!items.length) return EMPTY_SUMMARY;

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const quantityByProduct = new Map(items.map((i) => [i.product_id, i.quantity]));
  const { cheapestByProduct, dealByProductStore, storesByProduct, priceAtStore, allStoreIds } = lookups;

  let totalPrice = 0;
  let baselineTotal = 0;
  let sawAnyBaseline = false;
  let hasVerifiedSpecial = false;

  for (const productId of productIds) {
    const cheapest = cheapestByProduct.get(productId);
    if (!cheapest) continue; // no current price found for this product at all -- excluded from totals, not assumed $0
    const qty = quantityByProduct.get(productId) ?? 1;
    totalPrice += cheapest.price * qty;

    const deal = dealByProductStore.get(`${productId}:${cheapest.store_id}`);
    if (deal && deal.normal_price != null) {
      baselineTotal += deal.normal_price * qty;
      sawAnyBaseline = true;
    } else {
      baselineTotal += cheapest.price * qty; // no known "was" price -- assume no saving for this item, not a fabricated one
    }

    if (cheapest.is_special && deal && deal.verdict !== "DODGY" && deal.verdict !== "UNKNOWN") {
      hasVerifiedSpecial = true;
    }
  }

  // Best single-store total: only for stores with a price on every item in
  // THIS list. `storesByProduct`/`priceAtStore`/`allStoreIds` may contain
  // other lists' products too when lookups came from `fetchListPriceLookups`
  // over a multi-list union -- harmless, since every lookup here is keyed by
  // this list's own `productIds`, never iterated broadly.
  let bestPriceStore: ListSummary["bestPriceStore"] = null;
  for (const storeId of allStoreIds) {
    const coversEveryItem = productIds.every((pid) => storesByProduct.get(pid)?.has(storeId));
    if (!coversEveryItem) continue;
    const storeTotal = productIds.reduce((sum, pid) => {
      const qty = quantityByProduct.get(pid) ?? 1;
      return sum + (priceAtStore.get(`${pid}:${storeId}`) ?? 0) * qty;
    }, 0);
    if (!bestPriceStore || storeTotal < bestPriceStore.total) {
      bestPriceStore = { store: STORE_DISPLAY_FALLBACK[storeId] || titleCase(storeId), total: storeTotal };
    }
  }

  return {
    itemCount: items.length,
    totalPrice,
    bestPriceStore,
    hasSavingsData: sawAnyBaseline,
    savingsAmount: Math.max(0, Math.round((baselineTotal - totalPrice) * 100) / 100),
    hasVerifiedSpecial,
  };
}

/** Product columns `buildListItemProductCard` below needs beyond the
 * `id,name,brand` `apps/mobile`'s `loadListsData` originally fetched for
 * each item's plain-text name label -- `category`/`image_url`/`unit_size`,
 * same 3 extra columns `fetchNonSpecialProductCards` already pulls from
 * `products` for its own similar "build a card from a lookup, not the
 * specials view" case just above in this file. */
export interface ListItemProductMeta {
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  unit_size: string | null;
}

/**
 * Builds a full `ProductCard` (+ one `CurrentDeal`) for a SINGLE list
 * item's product, reusing the exact `cheapestByProduct`/`dealByProductStore`
 * lookups `computeListSummaryFromLookups` just above already consumes for a
 * list's aggregate summary badge/total -- no extra network round trip
 * beyond the caller widening its own `products` select from `id,name,brand`
 * to also carry `category,image_url,unit_size` (see `ListItemProductMeta`
 * just above).
 *
 * Added 2026-08-20, Lists-page UX audit (Jay: "Ok proceed with these" on
 * "item rows are bare text, no image/price/verdict, unlike every other
 * product card in this app" / "split view items from rename" / "item tap
 * should open the deal page") -- lets `apps/mobile`'s list-item rows use
 * `ListItemProductCard.tsx` (a compact sibling of `ProductListCard.tsx`,
 * not a retrofit of it -- see that new file's own doc comment for why a
 * separate component rather than extending `ProductListCard` itself) for
 * the same image+price+verdict-badge treatment `ProductListCard` already
 * gives every OTHER product surface in this app (Home, Specials, search),
 * instead of the plain `<span>{name}</span>` row this replaces.
 *
 * Deliberately NOT a full port of `buildProductCardsFromSpecials`'s
 * multi-store-aware grouping (data.ts) -- a list item only ever needs its
 * own single cheapest-price row, the same "cheapest across any store"
 * figure the list's own summary badge/total already show, not a
 * `currentDeals` array covering every store the way a Specials-page card
 * does. Fields the consuming card doesn't render -- `priceHistory`,
 * `description`, `explanation`, `ninetyDay*`, `saleStartedAt`/
 * `specialEndDate` -- get the same "genuinely unknown at this cheap lookup
 * tier, not fabricated" defaults `fetchNonSpecialProductCards` (just above)
 * already established for the same reason, not independently re-derived.
 *
 * Returns `null` when the product has no current price at all -- matches
 * `computeListSummaryFromLookups`'s own "excluded from totals, not assumed
 * $0" handling for that same case just above. The caller falls back to a
 * plain-text row for that one item rather than a card with a fabricated
 * price.
 */
export function buildListItemProductCard(
  productId: string,
  meta: ListItemProductMeta | undefined,
  lookups: ListPriceLookups
): ProductCard | null {
  if (!meta) return null;
  const cheapest = lookups.cheapestByProduct.get(productId);
  if (!cheapest) return null;

  // A list item represents a product, not a specific supermarket. Prefer the
  // cheapest live special at any store when one exists; otherwise retain the
  // cheapest current price so the row can render in its greyed-out state.
  const displayedPrice = lookups.specialByProduct?.get(productId) ?? cheapest;

  const dealRow = lookups.dealByProductStore.get(`${productId}:${displayedPrice.store_id}`);
  // `specialByProduct` is populated by the live lookup path only with
  // current-price rows that also have a matching deal-cache row. Keep the
  // fallback for older pure callers that do not provide that optional map.
  const isOnLiveSpecial =
    lookups.specialByProduct === undefined ? !!displayedPrice.is_special : !!displayedPrice.is_special && !!dealRow;
  // No matching dodgy_deals_cache row for this product's own cheapest store
  // -- either genuinely not on special right now ("Fair Price", same
  // convention `fetchNonSpecialProductCards` uses), or on special but not
  // yet verdict-classified ("Unverified Deal", an existing `CurrentDeal`
  // dealType this app already has for exactly this "on special, no verdict
  // to show" case -- not invented here).
  const dealType: CurrentDeal["dealType"] =
    dealRow && dealRow.verdict !== "UNKNOWN"
      ? VIEW_VERDICT_TO_DEAL_TYPE[dealRow.verdict]
      : isOnLiveSpecial
        ? "Unverified Deal"
        : "Fair Price";

  // No known "was" price -- same as `fetchNonSpecialProductCards`, assume
  // no saving rather than fabricate a discount percentage.
  const originalPrice = dealRow?.normal_price ?? displayedPrice.price;
  const discountPercentage =
    originalPrice > displayedPrice.price ? Math.round((1 - displayedPrice.price / originalPrice) * 100) : 0;

  const currentDeal: CurrentDeal = {
    store: STORE_DISPLAY_FALLBACK[displayedPrice.store_id] || titleCase(displayedPrice.store_id),
    price: displayedPrice.price,
    originalPrice,
    discountPercentage,
    dealType,
    wasArtificiallyInflated: dealType === "Dodgy Deal",
    reason: dealRow?.verdict ?? "Regular Price",
    explanation: null,
    isOnSpecial: isOnLiveSpecial,
    saleStartedAt: null,
    specialEndDate: null,
    ninetyDayLow: null,
    ninetyDayHigh: null,
    ninetyDayAvg: null,
    ninetyDaySamples: null,
    ninetyDaySpecialSamples: null,
    ninetyDayDaysTracked: null,
    ninetyDaySpecialDays: null,
  };

  return {
    id: productId,
    brand: titleCase(meta.brand) || "Unbranded",
    name: titleCase(meta.name),
    category: meta.category || "Grocery",
    image: meta.image_url || FALLBACK_PRODUCT_IMAGE,
    standardPrice: displayedPrice.price,
    unit: meta.unit_size || "",
    currentDeals: [currentDeal],
    priceHistory: [],
    description: "",
  };
}

/**
 * Convenience single-list wrapper over `fetchListPriceLookups` +
 * `computeListSummaryFromLookups`, for callers with just one list (e.g. a
 * detail view). S1's own list grid does NOT use this -- it fetches lookups
 * once for all lists and calls `computeListSummaryFromLookups` directly per
 * list, via `loadListsPageData` just below.
 */
export async function computeListSummary(
  config: SupabaseRestConfig,
  items: ListItemRow[]
): Promise<ListSummary> {
  if (!items.length) return EMPTY_SUMMARY;
  const productIds = items.map((i) => i.product_id);
  const lookups = await fetchListPriceLookups(config, productIds);
  return computeListSummaryFromLookups(items, lookups);
}

/** Everything S1's own list grid (`apps/mobile/src/app/lists/page.tsx`) needs for one render pass -- see `loadListsPageData` just below. */
export interface ListsPageData {
  rows: ListRow[];
  grouped: Map<string, ListItemRow[]>;
  summaries: Map<string, ListSummary>;
  productMeta: Map<string, ListItemProductMeta>;
  itemCards: Map<string, ProductCard>;
}

interface ListsPageCacheEntry {
  promise: Promise<ListsPageData>;
  resolvedAt: number | null;
}

/** Exported for tests only, not part of the public API surface -- same convention `data.ts`'s own `__liveProductsCache` already established for its own request-dedup cache. */
export const __listsPageCache = new Map<string, ListsPageCacheEntry>();

const LISTS_PAGE_CACHE_TTL_MS = 60_000;

/**
 * The actual composite fetch -- moved here verbatim (2026-08-20, per Jay:
 * "Can we cache the lists in a smart way? so they don't need to be loaded
 * each time you select the lists tab") from what used to be
 * `apps/mobile/src/app/lists/page.tsx`'s own page-local `loadListsData`
 * callback. Same 5-step shape that file's own doc comment already
 * describes in detail (fetch the user's lists, fetch every list's items in
 * one round trip, fetch price lookups for the union of every item's
 * product id, fetch product meta for the same union, build one
 * `ProductCard` per item that currently has a price) -- moved, not
 * rewritten, so this is a caching wrapper around existing behavior, not a
 * new data pipeline.
 */
async function loadListsPageDataUncached(
  client: SupabaseClient,
  config: SupabaseRestConfig
): Promise<ListsPageData> {
  const rows = await fetchUserLists(client);

  const items = await fetchItemsForLists(
    client,
    rows.map((l) => l.id)
  );
  const grouped = new Map<string, ListItemRow[]>();
  for (const item of items) {
    if (!grouped.has(item.list_id)) grouped.set(item.list_id, []);
    grouped.get(item.list_id)!.push(item);
  }

  const lookups = await fetchListPriceLookups(
    config,
    items.map((i) => i.product_id)
  );
  const summaries = new Map<string, ListSummary>(
    rows.map((list) => [list.id, computeListSummaryFromLookups(grouped.get(list.id) ?? [], lookups)])
  );

  const productRows = await fetchByIds<{ id: string } & ListItemProductMeta>(
    config,
    "products",
    "id",
    "id,name,brand,category,image_url,unit_size",
    [...new Set(items.map((i) => i.product_id))]
  );
  const productMeta = new Map(
    productRows.map((p) => [
      p.id,
      { name: p.name, brand: p.brand, category: p.category, image_url: p.image_url, unit_size: p.unit_size },
    ])
  );

  const itemCards = new Map<string, ProductCard>();
  for (const productId of new Set(items.map((i) => i.product_id))) {
    const card = buildListItemProductCard(productId, productMeta.get(productId), lookups);
    if (card) itemCards.set(productId, card);
  }

  return { rows, grouped, summaries, productMeta, itemCards };
}

/**
 * Short-TTL, in-memory, per-user request-dedup cache around
 * `loadListsPageDataUncached` -- same `{promise, resolvedAt}` shape
 * `data.ts`'s own `loadLiveProductsDeduped` already established for the
 * exact same reason (collapse overlapping/rapid-repeat callers into one
 * fetch), keyed per `userId` here instead of per `(url, anonKey)` since
 * this data is user-scoped, not a shared public catalogue.
 *
 * `TTL = 60s` is a backstop, not the primary freshness mechanism -- the
 * primary mechanism is `invalidateListsPageCache` (just below), which
 * every mutator that touches `lists`/`list_items` calls right after a
 * successful write: `handleCreate`/`handleDelete`/`handleRename`/
 * `handleRemoveItem` in `lists/page.tsx` (via that file's own `reload()`),
 * and `AddToListButton.tsx`'s `handleToggle` (add/remove from Home/Search
 * cards, which mutates the exact same `list_items` rows this cache is
 * built from, even though that component never renders this page). Without
 * that second call site's invalidation, adding/removing an item from a
 * product card elsewhere in the app would leave a stale item count/total on
 * this page for up to the full 60s TTL after the user next opens it --
 * flagged here so a future new mutator of `list_items` doesn't miss it.
 * The 60s TTL exists only to self-heal if some future write path is ever
 * added without also calling the invalidator, same reasoning
 * `loadLiveProductsDeduped`'s own TTL comment gives for its 30s value,
 * just longer here since this data changes only on this user's own actions
 * (no external nightly-scrape-style refresh to guard against).
 */
export function loadListsPageData(
  client: SupabaseClient,
  config: SupabaseRestConfig,
  userId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<ListsPageData> {
  const now = Date.now();
  const cached = __listsPageCache.get(userId);
  if (!options.forceRefresh && cached && (cached.resolvedAt === null || now - cached.resolvedAt < LISTS_PAGE_CACHE_TTL_MS)) {
    return cached.promise;
  }

  const promise = loadListsPageDataUncached(client, config);
  const entry: ListsPageCacheEntry = { promise, resolvedAt: null };
  __listsPageCache.set(userId, entry);
  promise.then(
    () => {
      entry.resolvedAt = Date.now();
    },
    () => {
      // Don't cache failures -- only evict if this is still the current
      // entry for this user (a newer call may have already replaced it).
      if (__listsPageCache.get(userId) === entry) __listsPageCache.delete(userId);
    }
  );
  return promise;
}

/**
 * Clears one user's cached lists-page data (or, with no argument, every
 * user's -- not expected to matter in a single-user browser session, kept
 * for symmetry/tests) so the next `loadListsPageData` call for that user
 * fetches fresh instead of serving a stale in-flight/resolved entry. Call
 * this immediately after any successful write to `lists`/`list_items` --
 * see `loadListsPageData`'s own doc comment above for the full list of
 * call sites this session wired it into.
 */
export function invalidateListsPageCache(userId?: string): void {
  if (userId) __listsPageCache.delete(userId);
  else __listsPageCache.clear();
}
