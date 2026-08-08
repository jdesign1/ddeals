import type { SupabaseClient } from "./supabase.ts";
import { fetchByIds, STORE_DISPLAY_FALLBACK, titleCase, type SupabaseRestConfig } from "./data.ts";

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
 * Computes an S1 list card's numbers from real `current_prices`/
 * `dodgy_deals` data — no stored/cached totals, recomputed from live prices
 * every time the list is loaded (matches this app's "no mock data" rule and
 * means totals never go stale between scrapes).
 */
export async function computeListSummary(
  config: SupabaseRestConfig,
  items: ListItemRow[]
): Promise<ListSummary> {
  if (!items.length) return EMPTY_SUMMARY;

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const quantityByProduct = new Map(items.map((i) => [i.product_id, i.quantity]));

  const [priceRows, dealRows] = await Promise.all([
    fetchByIds<CurrentPriceLookupRow>(
      config,
      "current_prices",
      "product_id",
      "product_id,store_id,price,is_special",
      productIds
    ),
    fetchByIds<DodgyDealsLookupRow>(
      config,
      "dodgy_deals",
      "product_id",
      "product_id,store_id,verdict,normal_price",
      productIds
    ),
  ]);

  // Cheapest current price per product, across any store.
  const cheapestByProduct = new Map<string, CurrentPriceLookupRow>();
  for (const row of priceRows) {
    const existing = cheapestByProduct.get(row.product_id);
    if (!existing || row.price < existing.price) cheapestByProduct.set(row.product_id, row);
  }

  // dodgy_deals verdict/normal_price keyed by (product_id, store_id) so we can
  // check whether a product's specific cheapest-store row is a *verified*
  // special, not just "some store somewhere has this on special".
  const dealByProductStore = new Map<string, DodgyDealsLookupRow>();
  for (const row of dealRows) dealByProductStore.set(`${row.product_id}:${row.store_id}`, row);

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

  // Best single-store total: only for stores with a price on every item.
  const storesByProduct = new Map<string, Set<string>>();
  const priceAtStore = new Map<string, number>(); // `${productId}:${storeId}` -> price
  for (const row of priceRows) {
    if (!storesByProduct.has(row.product_id)) storesByProduct.set(row.product_id, new Set());
    storesByProduct.get(row.product_id)!.add(row.store_id);
    priceAtStore.set(`${row.product_id}:${row.store_id}`, row.price);
  }
  const allStoreIds = new Set(priceRows.map((r) => r.store_id));
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
