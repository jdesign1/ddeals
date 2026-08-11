"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadLiveProducts, type ProductCard } from "@dodgey-deals/shared";
import { supabaseConfig } from "./config";

/**
 * Global full-screen search state (2026-08-09, per Jay's ask: "clicking the
 * search bar from home or any other screen should enter full search
 * screen"). Previously `isSearchActive`/`searchInput`/the live `products`
 * fetch all lived as local state inside `page.tsx` (Home), so
 * `FullScreenSearch`/`ScannerModal` could only be opened from Home --
 * navigating to `/specials`, `/lists`, or `/me` had no way to reach them at
 * all. Lifted here, mounted once in `layout.tsx` (same pattern as
 * `HeaderOverrideProvider`/`AuthProvider`), so any screen's header can open
 * the same overlay.
 *
 * `products`/`loadingProducts`/`error` now load exactly once here instead
 * of once per mount site -- Home used to run its own `loadLiveProducts`
 * call independently of this; consolidating to one call site is strictly
 * better for the egress-consciousness this project has been deliberate
 * about elsewhere (see project.md's "Diagnosed and fixed a Supabase egress
 * source" session), not just a refactor convenience. `loadLiveProducts`
 * already has its own two-layer cache (IndexedDB + in-memory dedup, see
 * `packages/shared/src/data.ts`), so this doesn't change *what* gets
 * fetched, just collapses what used to be (at minimum) Home's own fetch
 * plus whatever a second mount site would have added into a single one.
 */

/** Identifies the specific deal `FullScreenSearch` navigated away to, so
 * that deal page's own back button can tell "I was reached from search,
 * reopen it" apart from "I was reached some other way (Home's Trending
 * rail, /specials, a direct link), behave normally" -- see
 * `pauseForDealNavigation`/`resumeAfterDealBack` below. */
interface PendingDealReturn {
  productId: string;
  store: string;
}

interface SearchContextValue {
  products: ProductCard[];
  loadingProducts: boolean;
  error: string | null;
  query: string;
  setQuery: (value: string) => void;
  isActive: boolean;
  /** Re-runs the initial specials fetch after a failed load (2026-08-11,
   * `ErrorState`'s Try Again button) -- see the effect below for why this is
   * a plain retry counter rather than calling `loadLiveProducts` directly
   * from here. */
  retry: () => void;
  /** Opens the full-screen overlay without touching the query -- ported
   * from Prototype/index.html's `onFocus={() => setIsSearchActive(true)}`. */
  openSearch: () => void;
  /** Back arrow / dedicated close button -- clears the query AND exits,
   * same as the prototype's `handleClearSearch`. */
  closeSearch: () => void;
  /** Set once a card tap is about to navigate to `/deal/[id]/[store]` from
   * inside the overlay, cleared once that return trip is consumed (or a
   * different one starts) -- see the two functions below. */
  returnToSearch: PendingDealReturn | null;
  /** Hides the overlay (like `closeSearch`) but, deliberately unlike it,
   * does NOT clear `query` -- called right before navigating to a deal
   * from a search result (2026-08-10, per Jay's ask that the search term
   * and results still be there on return), not when the user is
   * genuinely exiting search via its own back arrow/clear button (that
   * case should still reset, `closeSearch` unchanged for it). Also
   * records which deal this was for, via `returnToSearch`. */
  pauseForDealNavigation: (productId: string, store: string) => void;
  /** Reopens the overlay and clears `returnToSearch` -- called by the deal
   * page's own back button, only when `returnToSearch` matches the deal
   * actually being viewed (guards against a stale pending return from an
   * earlier, abandoned deal-page visit incorrectly reopening search on an
   * unrelated later one, e.g. if the user left a deal page via BottomNav
   * instead of its back button). */
  resumeAfterDealBack: () => void;
  isScannerOpen: boolean;
  openScanner: () => void;
  closeScanner: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [returnToSearch, setReturnToSearch] = useState<PendingDealReturn | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  // Bumped by `retry()` below to force the effect to re-run. A plain counter
  // rather than calling the fetch directly from `retry()` so there's still
  // exactly one place (`fetchProducts` below) that owns the load-products
  // lifecycle -- `retry` just asks for another attempt, it doesn't duplicate
  // the loading/error/cancelled bookkeeping that attempt needs.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadLiveProducts(supabaseConfig)
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load specials");
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  const value = useMemo<SearchContextValue>(
    () => ({
      products,
      loadingProducts,
      error,
      query,
      setQuery,
      isActive,
      // Resets `loadingProducts`/`error` here (an event handler, not the
      // effect body -- setting state synchronously inside the effect itself
      // trips this project's react-hooks/set-state-in-effect rule, see
      // TrendingSection/specials/page.tsx's own doc comments for the same
      // rule elsewhere in this app) before bumping `retryTick`, so the
      // ErrorState/LoadingMascot swap the instant Try Again is tapped
      // rather than waiting a frame for the effect to notice.
      retry: () => {
        setError(null);
        setLoadingProducts(true);
        setRetryTick((t) => t + 1);
      },
      openSearch: () => setIsActive(true),
      closeSearch: () => {
        setQuery("");
        setIsActive(false);
        setReturnToSearch(null);
      },
      returnToSearch,
      pauseForDealNavigation: (productId, store) => {
        setIsActive(false);
        setReturnToSearch({ productId, store });
      },
      resumeAfterDealBack: () => {
        setIsActive(true);
        setReturnToSearch(null);
      },
      isScannerOpen,
      openScanner: () => setIsScannerOpen(true),
      closeScanner: () => setIsScannerOpen(false),
    }),
    [products, loadingProducts, error, query, isActive, returnToSearch, isScannerOpen]
    // Note: `retry` and `openSearch`/etc. are stable closures (no external
    // deps beyond the setters, which React guarantees are stable), so they
    // don't need to be listed here -- same convention this array already
    // followed before `retry` was added.
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within a SearchProvider");
  return ctx;
}
