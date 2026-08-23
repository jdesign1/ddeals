"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScanBarcode } from "lucide-react";
import {
  loadLiveProducts,
  storeMatchesFilter,
  deriveAvailableStoreKeys,
  STORE_DISPLAY_FALLBACK,
  describeFetchError,
  type ProductCard,
  type CurrentDeal,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";
import DealCard from "@/components/DealCard";
import FilterPill from "@/components/FilterPill";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import { useInfiniteReveal, INFINITE_REVEAL_MAX_ITEMS } from "@/hooks/useInfiniteReveal";

/**
 * S8 — Latest Specials Browse, per project.md's Stitch screen inventory.
 * Grid of specials from all stores, filter pills, TRUE SPECIAL / DODGY DEAL
 * badges. First fully live-data screen ported into apps/mobile — see
 * project.md's "IMPORTANT ACTIVE PLAN — Native iOS/Android App" for status.
 *
 * Deliberate simplifications vs. the Stitch mock, flagged here rather than
 * faked: per-card "+" add-to-list FAB now wired (2026-08-08, once S1/lists
 * existed — see AddToListButton.tsx) but no bottom "$X this week — View
 * List" savings bar yet (needs a cross-list "this week" aggregate, not
 * built).
 *
 * Each card here is one (product, store) deal, not a merged cross-store
 * product card — matches the Stitch design's store-filterable single-deal
 * cards ("Filter pills: All Stores / New World / Countdown / Pak'nSave").
 *
 * The "Specials" `<h1>` is gone as of 2026-08-13, per Jay's "remove the h1
 * titles from each page, as we have the title in the top nav bar" --
 * `AppHeader.tsx` already shows "Specials" for this route via
 * `ROUTE_TITLES`. The header row used to be `justify-between` (title left,
 * a decorative `ScanBarcode` icon right); now `justify-end` so the icon
 * keeps its original top-right position.
 *
 * "No specials found..." now renders through the shared `EmptyState.tsx`
 * card (2026-08-20, per Jay's "white card background around all empty
 * state messages" ask -- see that component's own doc comment) instead of
 * a bare `<p>` -- was `px-5` on the `<p>` itself since `<main>` here has no
 * padding of its own; that same `px-5` now lives on `EmptyState`'s
 * `className` prop instead, same visual inset either way.
 */

interface FlatDeal {
  product: ProductCard;
  deal: CurrentDeal;
}

/** Initial/per-scroll batch size for the infinite-reveal grid below --
 * arbitrary-but-reasonable for a 2-column grid, no other page shares this
 * constant so it's kept local rather than promoted to the shared hook. */
const SPECIALS_PAGE_SIZE = 20;

export default function SpecialsPage() {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState("all");
  // Bumped by the ErrorState's Try Again button to re-run the effect below --
  // same plain-counter retry pattern as search-context.tsx's `retryTick`
  // (2026-08-11, added alongside this for the same "no retry existed
  // anywhere" gap).
  const [retryTick, setRetryTick] = useState(0);
  // Resets `loading`/`error` here (an event handler, not the effect body --
  // setting state synchronously inside the effect itself trips this
  // project's react-hooks/set-state-in-effect rule) before bumping
  // `retryTick`, so the ErrorState/LoadingMascot swap the instant Try Again
  // is tapped rather than waiting a frame for the effect to notice.
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLiveProducts(supabaseConfig)
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeFetchError(err, "Failed to load specials"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  const flatDeals = useMemo<FlatDeal[]>(() => {
    const all: FlatDeal[] = [];
    for (const product of products) {
      for (const deal of product.currentDeals) {
        all.push({ product, deal });
      }
    }
    return all.sort((a, b) => b.deal.discountPercentage - a.deal.discountPercentage);
  }, [products]);

  // deriveAvailableStoreKeys (packages/shared/src/data.ts) — was a local
  // `present.has(key)` exact-match check until this session's full-screen
  // search refactor folded it into the shared helper; that exact-match form
  // had the same live bug page.tsx's own version was fixed for on
  // 2026-08-09 (Woolworths' real store_name is "Woolworths NZ", which
  // normalizes to "woolworthsnz", never exactly "woolworths"), just never
  // separately caught here. Substring `.includes()` match fixes it.
  const availableStoreKeys = useMemo(() => deriveAvailableStoreKeys(products), [products]);

  const filteredDeals = useMemo(
    () => flatDeals.filter(({ deal }) => storeMatchesFilter(deal.store, storeFilter)),
    [flatDeals, storeFilter]
  );

  // Infinite-scroll reveal, added 2026-08-21 -- this page previously had NO
  // cap at all (`filteredDeals.map(...)` rendered straight into the grid),
  // the worst offender found in that day's "Show all X deals" discussion:
  // "All Stores" here renders the FULL current-specials catalogue (~9,211
  // rows live, checked via the `dodgy_deals_cache` REST endpoint directly)
  // unconditionally on every load. See useInfiniteReveal.ts's own doc
  // comment for why scroll-triggered reveal is free here (egress-wise) and
  // why INFINITE_REVEAL_MAX_ITEMS exists (DOM/render cost, not network).
  const { visibleCount, sentinelRef, isCapped } = useInfiniteReveal({
    totalCount: filteredDeals.length,
    chunkSize: SPECIALS_PAGE_SIZE,
    maxItems: INFINITE_REVEAL_MAX_ITEMS,
    resetKey: filteredDeals,
  });
  const visibleDeals = filteredDeals.slice(0, visibleCount);

  return (
    <main className="flex flex-col gap-4 pb-6">
      <header className="flex items-center justify-end px-5 pt-6">
        <ScanBarcode className="h-5 w-5 text-stone-500" aria-hidden="true" />
      </header>

      <div className="flex gap-2 overflow-x-auto px-5 pb-1">
        <FilterPill label="All Stores" active={storeFilter === "all"} onClick={() => setStoreFilter("all")} />
        {availableStoreKeys.map((key) => (
          <FilterPill
            key={key}
            label={displayNameForKey(key)}
            active={storeFilter === key}
            onClick={() => setStoreFilter(key)}
          />
        ))}
      </div>

      <LoadingMascot loading={loading} />
      {error && <ErrorState message="Couldn't load specials." detail={error} onRetry={retry} />}

      {!loading && !error && filteredDeals.length === 0 && (
        <EmptyState className="mx-5">
          {storeFilter === "all"
            ? "No specials found right now."
            : "No specials found for this store right now."}
        </EmptyState>
      )}

      <div className="grid grid-cols-2 gap-3 px-5">
        {visibleDeals.map(({ product, deal }) => (
          <DealCard key={`${product.id}-${deal.store}`} product={product} deal={deal} />
        ))}
        {/* col-span-2 -- this is a 2-column grid, a bare `w-full` sentinel
            would only span one cell. Same pattern as TrendingSection's own
            copy of this comment (page.tsx). */}
        {visibleCount < filteredDeals.length && !isCapped && (
          <div ref={sentinelRef} aria-hidden="true" className="col-span-2 h-px w-full" />
        )}
      </div>
      {isCapped && (
        <p className="px-5 py-2 text-center text-[13px] leading-4 font-semibold text-stone-500">
          Showing top {INFINITE_REVEAL_MAX_ITEMS} of {filteredDeals.length} — narrow with a store filter to see more.
        </p>
      )}
    </main>
  );
}

function displayNameForKey(key: string): string {
  return STORE_DISPLAY_FALLBACK[key] || key;
}
