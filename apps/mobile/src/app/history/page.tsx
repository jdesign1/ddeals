"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  fetchDealCheckHistory,
  fetchNonSpecialProductCards,
  type DealCheckRow,
  type ProductCard as ProductCardData,
  type CurrentDeal,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/search-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import AuthPanel from "@/components/AuthPanel";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import ProductListCard from "@/components/ProductListCard";

/**
 * All Checks — ported from Prototype/index.html's `HistoryTab` (2026-08-11,
 * per Jay's ask to port both "All Checks" and "Deal Stats"). New route
 * (`/history`), reached via a link from `/me` (Deal Stats) rather than its
 * own bottom-nav tab — Jay's call, see project.md.
 *
 * Real data throughout, backed by `deal_checks` (see
 * `packages/shared/src/deal-checks.ts`) — every row here is a real past
 * visit to the deal-assessment page, not a fabricated or replayed one.
 *
 * Deliberate differences from the prototype's own `HistoryTab`, flagged
 * rather than silently dropped:
 *  - Card component is this app's real `ProductListCard` (already used by
 *    Home/full-screen search/deal-assessment's cheaper-alternatives view),
 *    not the prototype's own bespoke `ProductCard`, matching this app's
 *    established one-shared-card convention. `storeLinePrefix="Checked
 *    at"` and a synthetic per-row `deal` object (built from the checked
 *    row's own snapshotted `store`/`price`, not today's live price)
 *    reproduce the prototype's own "this is a historical record, not
 *    today's cheapest option" framing.
 *  - No typo-tolerant fuzzy search fallback (`isFuzzyProductMatch`) —
 *    plain substring match on normalized name/brand only, same established
 *    simplification `FullScreenSearch.tsx`'s own doc comment already made
 *    for the same reason (Levenshtein tolerance matters most at the
 *    prototype's full-catalogue scale; this app's data volumes are much
 *    smaller).
 *  - No "Recheck" action wired to reopen a modal — tapping a card here
 *    navigates to the real `/deal/[id]/[store]` route instead (via
 *    `ProductListCard`'s own built-in tap-to-navigate), this app's real
 *    equivalent of the prototype's `onRecheck`/`DealModal` reopen. This
 *    itself logs a NEW `deal_checks` row, same as visiting from anywhere
 *    else — a deliberate, accurate behavior (re-checking a deal really is
 *    checking it again), not an accidental duplicate-logging bug.
 *  - A checked product that's rolled off every current special (no longer
 *    in the live specials dataset `useSearch()` already loads) is resolved
 *    via `fetchNonSpecialProductCards` — a small, targeted, on-demand
 *    lookup (see that function's own doc comment in data.ts, previously
 *    written but never actually called from anywhere in this app) instead
 *    of silently dropping it from the list or fabricating stale data.
 *    Products that don't resolve either way are still counted in "N
 *    checks" and simply skipped from the rendered list — real, not faked.
 */
export default function HistoryPage() {
  const { user, isFakeSession, loading: authLoading } = useAuth();
  const { products: liveProducts, loadingProducts: liveProductsLoading } = useSearch();

  const [history, setHistory] = useState<DealCheckRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => {
    setError(null);
    setHistory(null);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchDealCheckHistory(getSupabaseClient())
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load your check history");
      });
    return () => {
      cancelled = true;
    };
  }, [user, retryTick]);

  // Gap-fill: any checked product not in the currently-loaded live specials
  // set (rolled off special since it was checked) gets looked up
  // separately. Runs once history resolves, not on every render -- keyed
  // off the actual set of missing ids so it doesn't re-fire pointlessly
  // when `liveProducts` itself updates for unrelated reasons.
  const [fallbackProducts, setFallbackProducts] = useState<ProductCardData[]>([]);
  const missingIds = useMemo(() => {
    // Waits for the global specials fetch (`useSearch()`, loaded once in
    // layout.tsx) to actually finish before deciding what's "missing" --
    // otherwise every checked product looks missing during the brief
    // window `liveProducts` is still `[]` on a fresh load, triggering a
    // pointless full gap-fill fetch that a moment later becomes mostly
    // redundant once the real specials list arrives.
    if (!history || liveProductsLoading) return [];
    const liveIds = new Set(liveProducts.map((p) => p.id));
    return [...new Set(history.map((h) => h.product_id).filter((id) => !liveIds.has(id)))];
  }, [history, liveProducts, liveProductsLoading]);
  const missingIdsKey = missingIds.join(",");
  useEffect(() => {
    if (!missingIds.length) {
      setFallbackProducts([]);
      return;
    }
    let cancelled = false;
    fetchNonSpecialProductCards(supabaseConfig, missingIds)
      .then((rows) => {
        if (!cancelled) setFallbackProducts(rows);
      })
      .catch(() => {
        // Best-effort only -- a failed gap-fill just means those specific
        // rows fall back to being skipped below (real data only, see this
        // file's own header comment), not a page-level error. The history
        // list itself already loaded successfully by this point.
        if (!cancelled) setFallbackProducts([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off
    // missingIdsKey (a stable string) deliberately, not missingIds itself
    // (a new array identity every render).
  }, [missingIdsKey]);

  const productById = useMemo(() => {
    const map = new Map<string, ProductCardData>();
    for (const p of liveProducts) map.set(p.id, p);
    for (const p of fallbackProducts) if (!map.has(p.id)) map.set(p.id, p);
    return map;
  }, [liveProducts, fallbackProducts]);

  const [searchQuery, setSearchQuery] = useState("");
  const filteredHistory = useMemo(() => {
    if (!history) return [];
    const q = normalizeSearchText(searchQuery.trim());
    if (!q) return history;
    return history.filter((h) => {
      const product = productById.get(h.product_id);
      if (!product) return false;
      return normalizeSearchText(product.name).includes(q) || normalizeSearchText(product.brand).includes(q);
    });
  }, [history, searchQuery, productById]);

  if (authLoading) {
    return (
      <main className="flex flex-col gap-3 px-5 py-8">
        <h1 className="text-2xl font-extrabold text-stone-900">All Checks</h1>
        <p className="text-sm text-stone-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-col gap-4 px-5 py-8">
        <h1 className="text-2xl font-extrabold text-stone-900">All Checks</h1>
        <AuthPanel prompt="Log in to review every supermarket deal and price you've checked." />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-3 px-5 pt-6">
        <h1 className="text-2xl font-extrabold text-stone-900">All Checks</h1>
        <p className="text-xs leading-relaxed text-stone-600">
          Every supermarket deal and price you&rsquo;ve checked, most recent first.
        </p>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your check history…"
            className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-4 text-xs font-medium text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-ink-200"
          />
        </div>
      </header>

      {isFakeSession && (
        // Same amber "dev tool" language/styling as lists/page.tsx and
        // /me's own Test Mode notice -- caught in peer review as a real,
        // if minor, inconsistency: without this, a fake-session user just
        // sees an empty history with no explanation why (a plain SELECT
        // silently returns zero rows under RLS for an unauthenticated
        // request, rather than throwing).
        <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Test Mode</p>
          <p className="text-xs leading-relaxed text-amber-700">
            This is a simulated login for design testing, not a real account — your check history will always be
            empty since there&rsquo;s no real account for it to save to.
          </p>
        </div>
      )}

      <LoadingMascot loading={history === null && !error} label="Loading your check history…" />
      {error && <ErrorState message="Couldn't load your check history." detail={error} onRetry={retry} />}

      {history !== null && !error && (
        history.length === 0 ? (
          <div className="mx-5 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 bg-white py-12 text-center">
            <p className="max-w-xs px-4 text-xs font-bold uppercase tracking-widest text-stone-500">
              Your checking history is empty
            </p>
            <p className="max-w-xs px-4 text-xs text-stone-400">
              Search for a product or scan a barcode from Home to check your first deal.
            </p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="mx-5 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 bg-white py-12 text-center">
            <p className="max-w-xs px-4 text-xs font-bold uppercase tracking-widest text-stone-500">
              No matching checks found
            </p>
            <p className="max-w-xs px-4 text-xs text-stone-400">Try searching for a different product name or brand.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5">
            {filteredHistory.map((h) => {
              const product = productById.get(h.product_id);
              if (!product) return null;
              const deal = buildHistoricalDeal(h);
              const alsoSpecialStores = [
                ...new Set(
                  (product.currentDeals || [])
                    .filter((d) => d.isOnSpecial !== false && d.store !== h.store)
                    .map((d) => d.store)
                ),
              ];
              return (
                <ProductListCard
                  key={h.id}
                  product={product}
                  deal={deal}
                  storeLinePrefix="Checked at"
                  alsoSpecialStores={alsoSpecialStores}
                />
              );
            })}
          </div>
        )
      )}
    </main>
  );
}

/** Same normalization FullScreenSearch.tsx's own local copy uses (see that
 * file's header comment for why it's duplicated locally rather than
 * shared) -- punctuation/case-insensitive substring matching. */
const normalizeSearchText = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Builds a `CurrentDeal`-shaped object from a `deal_checks` row's own
 * snapshotted values, NOT looked up from the live product's current deals
 * -- this row IS the historical record of what was actually checked, at
 * whatever price/store that was, which may no longer match today's live
 * price at all. Only the fields `ProductListCard` actually reads
 * (`store`/`price`/`dealType`, confirmed against that component's own
 * source) matter for display; the rest are filled with honest, inert
 * defaults rather than fabricated ones. */
function buildHistoricalDeal(h: DealCheckRow): CurrentDeal {
  return {
    store: h.store,
    price: h.price,
    originalPrice: h.original_price,
    discountPercentage:
      h.original_price > 0 ? Math.round(((h.original_price - h.price) / h.original_price) * 100) : 0,
    dealType: h.deal_type,
    wasArtificiallyInflated: false,
    reason: "",
    explanation: null,
    isOnSpecial: h.deal_type !== "Fair Price",
    saleStartedAt: null,
    specialEndDate: null,
  };
}
