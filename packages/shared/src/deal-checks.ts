import type { SupabaseClient } from "./supabase.ts";
import { normalizeStoreKey } from "./data.ts";
import type { CurrentDeal } from "./data.ts";
import { DEAL_DETAIL_STORES_LIST } from "./deal-detail.ts";

/**
 * Real, per-user "deal check" log — backs two ported prototype screens in
 * apps/mobile, `HistoryTab` ("All Checks") and `ProfileTab` ("Deal Stats"),
 * per Jay's ask (2026-08-11) to port both. Schema:
 * /migrations/20260811_deal_checks.sql. Jay's explicit call, asked directly
 * rather than guessed: build a real, going-forward tracking table now
 * rather than faking either screen from `list_items` (adding a product to
 * a list is a different real-world event from viewing/checking its deal
 * page — using one to stand in for the other would misrepresent what the
 * user actually did, the kind of fabrication this app exists to catch, not
 * commit).
 *
 * `logDealCheck` is called once by the deal-assessment page
 * (`app/deal/[id]/[store]/page.tsx`) the first time it resolves a real
 * `product`/`deal` pair for a signed-in (non-fake-session) user — see that
 * page's own doc comment for exactly when/how.
 */

export interface DealCheckRow {
  id: string;
  user_id: string;
  product_id: string;
  store: string;
  price: number;
  original_price: number;
  deal_type: CurrentDeal["dealType"];
  checked_at: string;
}

/**
 * Fire-and-forget from the caller's point of view (the deal page doesn't
 * block rendering on this, see its own comment) but NOT swallowed here —
 * throws on a real failure so the caller can decide whether to log/ignore
 * it, same convention as every other write in lists.ts. RLS's own
 * `WITH CHECK ((select auth.uid()) = user_id)` is the real backstop against
 * a caller passing the wrong `userId` (mirrors `createList`'s own comment
 * in lists.ts) — `userId` here must be the caller's own `auth.uid()`.
 */
export async function logDealCheck(
  client: SupabaseClient,
  userId: string,
  productId: string,
  store: string,
  price: number,
  originalPrice: number,
  dealType: CurrentDeal["dealType"]
): Promise<void> {
  const { error } = await client.from("deal_checks").insert({
    user_id: userId,
    product_id: productId,
    store,
    price,
    original_price: originalPrice,
    deal_type: dealType,
  });
  if (error) throw new Error(`logDealCheck: ${error.message}`);
}

/**
 * Most-recent-first, matching `deal_checks_user_id_checked_at_idx`'s own
 * column order — RLS already scopes this to the caller's own rows, no
 * explicit `.eq("user_id", ...)` needed (same convention `fetchUserLists`
 * already relies on). `limit` caps the history page's own render/fetch
 * volume, consistent with this app's established egress-consciousness
 * (see project.md's "Diagnosed and fixed a Supabase egress source"
 * session) — 200 is generous for a "recent checks" list without being
 * unbounded.
 */
export async function fetchDealCheckHistory(client: SupabaseClient, limit = 200): Promise<DealCheckRow[]> {
  const { data, error } = await client
    .from("deal_checks")
    .select("*")
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchDealCheckHistory: ${error.message}`);
  return (data as DealCheckRow[]) ?? [];
}

export interface DealStatsStoreBreakdown {
  store: string;
  real: number;
  dodgy: number;
}

export interface DealStats {
  /** Total number of deal checks logged (every visit counts, not deduped
   * by product) — matches the History list's own item count. */
  totalChecked: number;
  /** Distinct products with at least one "Real Deal" check. */
  realSavers: number;
  /** Distinct products with at least one "Dodgy Deal" check. */
  dodgySpotted: number;
  /**
   * Sum of each check's own real, snapshotted `original_price - price`
   * (floored at 0 per check, so a check where the price was AT or ABOVE its
   * own baseline never contributes a negative "saving"). Deliberately NOT
   * the prototype's own explanation ("difference between the highest and
   * lowest price found for this item") — this table only ever snapshots
   * the ONE store/price actually checked, not every store's price at that
   * moment, so that calculation isn't reproducible here. This is a
   * different, but equally real, number: total real savings across
   * everything you've actually checked, each measured against that
   * specific check's own recent baseline (the same `originalPrice` the
   * deal-assessment page itself shows and explains). `/me/page.tsx`'s own
   * "How we calculate this" copy describes this version, not the
   * prototype's.
   */
  moneySaved: number;
  /** Per-store real/dodgy breakdown, one row per `DEAL_DETAIL_STORES_LIST`
   * entry (this app's real 5-store list), zero-filled for stores with no
   * checks yet rather than omitted — matches the prototype's own
   * `ProfileTab` table shape (a fixed row per known supermarket). */
  storeStats: DealStatsStoreBreakdown[];
}

/** Pure — no network calls. Mirrors `Prototype/index.html`'s `ProfileTab`
 * inline stats computation, adapted to this table's real columns (see
 * `moneySaved`'s own doc comment above for the one real behavioural
 * difference). */
export function computeDealStats(history: DealCheckRow[]): DealStats {
  const realSavers = new Set(history.filter((h) => h.deal_type === "Real Deal").map((h) => h.product_id)).size;
  const dodgySpotted = new Set(history.filter((h) => h.deal_type === "Dodgy Deal").map((h) => h.product_id)).size;
  const moneySaved = history.reduce((sum, h) => sum + Math.max(0, h.original_price - h.price), 0);

  const storeStats: DealStatsStoreBreakdown[] = DEAL_DETAIL_STORES_LIST.map((store) => {
    const storeHistory = history.filter((h) => normalizeStoreKey(h.store).includes(normalizeStoreKey(store)));
    return {
      store,
      real: new Set(storeHistory.filter((h) => h.deal_type === "Real Deal").map((h) => h.product_id)).size,
      dodgy: new Set(storeHistory.filter((h) => h.deal_type === "Dodgy Deal").map((h) => h.product_id)).size,
    };
  });

  return {
    totalChecked: history.length,
    realSavers,
    dodgySpotted,
    moneySaved: Math.round(moneySaved * 100) / 100,
    storeStats,
  };
}
