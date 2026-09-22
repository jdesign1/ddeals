"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadLiveProducts,
  invalidateLiveProductsPublicationMarker,
  refreshLiveProducts,
  describeFetchError,
  type ProductCard,
  type RefreshLiveProductsResult,
  filterRecentlyVerifiedSpecials,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "./config";
import { publishCatalogueUpdate, subscribeToCatalogueUpdates } from "./catalogue-refresh";
import { subscribeToCataloguePublication } from "./catalogue-publication";
import type { DealFilter } from "./deal-filters";

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
  /** Supermarket preference shared by Check deals and full-screen search. */
  selectedStores: string[];
  toggleStore: (storeId: string) => void;
  /** Deal filter shared by Check Deals and both full-screen search views. */
  dealFilter: DealFilter;
  setDealFilter: (filter: DealFilter) => void;
  query: string;
  setQuery: (value: string) => void;
  isActive: boolean;
  /** True after the search overlay has been opened once this session. */
  hasOpenedSearch: boolean;
  /** Whether the next fresh search opening should focus the input. */
  focusSearchOnOpen: boolean;
  /** Re-runs the initial specials fetch after a failed load (2026-08-11,
   * `ErrorState`'s Try Again button) -- see the effect below for why this is
   * a plain retry counter rather than calling `loadLiveProducts` directly
   * from here. */
  retry: () => void;
  /** Explicit pull-to-refresh entry point. It is shared by every route and
   * includes the persistent cooldown that protects Supabase egress. */
  refreshCatalogue: () => Promise<RefreshLiveProductsResult>;
  /** Opens the full-screen overlay without touching the query -- ported
   * from Prototype/index.html's `onFocus={() => setIsSearchActive(true)}`. */
  openSearch: () => void;
  /** Opens search with a specific deal tab selected, resetting any stale
   * query so a post-login new-specials CTA always lands on the latest browse
   * view. `focus: false` is used by the New Specials launch notice so its
   * destination opens ready to browse without summoning the keyboard. */
  openSearchForFilter: (filter: DealFilter, options?: { focus?: boolean }) => void;
  /** Back arrow / dedicated close button -- clears the query AND exits,
   * same as the prototype's `handleClearSearch`. */
  closeSearch: () => void;
  /** Set once a card tap is about to navigate to `/deal/[id]/[store]` from
   * inside the overlay, cleared once that return trip is consumed (or a
   * different one starts) -- see the two functions below. */
  returnToSearch: PendingDealReturn | null;
  /** Records a pending deal navigation without hiding the overlay yet. The
   * selected card must remain visible until the App Router has arrived at
   * the deal route, otherwise Check Deals flashes underneath the closing
   * search surface. */
  pauseForDealNavigation: (productId: string, store: string) => void;
  /** Hides the search overlay after the deal route has mounted, preserving
   * the query and `returnToSearch` so Back can restore the search state. */
  finishDealNavigation: () => void;
  /** Reopens the overlay and clears `returnToSearch` -- called by the deal
   * page's own back button, only when `returnToSearch` matches the deal
   * actually being viewed (guards against a stale pending return from an
   * earlier, abandoned deal-page visit incorrectly reopening search on an
   * unrelated later one, e.g. if the user left a deal page via BottomNav
   * instead of its back button). The full-screen search uses the accompanying
   * `preserveSearchStateOnOpen` flag to distinguish this resume from a fresh
   * search entry, so its selected tab and saved scroll position survive the
   * deal-page detour. */
  resumeAfterDealBack: () => void;
  /** True when the next search overlay opening is a return from a deal page,
   * rather than a fresh search entry. */
  preserveSearchStateOnOpen: boolean;
  isScannerOpen: boolean;
  /** True after the scanner has been opened once this session. */
  hasOpenedScanner: boolean;
  openScanner: () => void;
  closeScanner: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

const INITIAL_CATALOGUE_RETRY_DELAYS_MS = [500, 1500];

function shouldRetryCatalogueLoad(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const statusMatch = error.message.match(/HTTP (\d+)/);
  if (!statusMatch) return true;
  const status = Number(statusMatch[1]);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function loadLiveProductsWithRetry(): Promise<ProductCard[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= INITIAL_CATALOGUE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await loadLiveProducts(supabaseConfig);
    } catch (error) {
      lastError = error;
      const retryDelay = INITIAL_CATALOGUE_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined || !shouldRetryCatalogueLoad(error)) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to load specials");
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Kept in the global search provider so the Check deals page and the
  // full-screen search overlay always show and filter by the same preferred
  // supermarkets, even when the Home route is remounted between visits.
  const [selectedStores, setSelectedStores] = useState<string[]>(["all"]);
  const [dealFilter, setDealFilter] = useState<DealFilter>("all");
  const [query, setQuery] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [hasOpenedSearch, setHasOpenedSearch] = useState(false);
  const [focusSearchOnOpen, setFocusSearchOnOpen] = useState(true);
  const [returnToSearch, setReturnToSearch] = useState<PendingDealReturn | null>(null);
  const [preserveSearchStateOnOpen, setPreserveSearchStateOnOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [hasOpenedScanner, setHasOpenedScanner] = useState(false);
  const pathname = usePathname();
  const shouldLoadCatalogue = pathname === "/" || pathname === "/specials" || isActive;
  // Bumped by `retry()` below to force the effect to re-run. A plain counter
  // rather than calling the fetch directly from `retry()` so there's still
  // exactly one place (`fetchProducts` below) that owns the load-products
  // lifecycle -- `retry` just asks for another attempt, it doesn't duplicate
  // the loading/error/cancelled bookkeeping that attempt needs.
  const [retryTick, setRetryTick] = useState(0);

  const refreshCatalogue = useCallback(async (): Promise<RefreshLiveProductsResult> => {
    const result = await refreshLiveProducts(supabaseConfig);
    setProducts(result.products);
    setError(null);
    publishCatalogueUpdate(result.products);
    return result;
  }, []);

  const toggleStore = useCallback((storeId: string) => {
    if (storeId === "all") {
      setSelectedStores(["all"]);
      return;
    }
    setSelectedStores((prev) => {
      const next = prev.includes("all")
        ? [storeId]
        : prev.includes(storeId)
          ? prev.filter((id) => id !== storeId)
          : [...prev, storeId];
      return next.length === 0 ? ["all"] : next;
    });
  }, []);

  useEffect(() => {
    if (!shouldLoadCatalogue) return;
    let cancelled = false;
    loadLiveProductsWithRetry()
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeFetchError(err, "Failed to load specials"));
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryTick, shouldLoadCatalogue]);

  // Deal-detail targeted validation can update a single cached card without
  // downloading the full catalogue. Keep the global Check-deals/search state
  // in sync when that happens, so navigating back never restores the stale
  // verdict from before the detail page was opened.
  useEffect(() => subscribeToCatalogueUpdates((result) => {
    setProducts(result);
  }), []);

  // Cached cards carry each store's verification time. Expire those deals
  // locally even if this screen remains open during a Realtime outage.
  useEffect(() => {
    if (!shouldLoadCatalogue) return;
    const timer = window.setInterval(() => {
      setProducts((current) => filterRecentlyVerifiedSpecials(current));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [shouldLoadCatalogue]);

  // Revalidate when the database publishes a new catalogue. The realtime
  // event is only an invalidation signal; loadLiveProducts still compares the
  // durable publication marker and downloads the full catalogue at most once
  // per publication. Visibility handling catches events missed while the
  // browser/webview was suspended, and SUBSCRIBED catches reconnects.
  useEffect(() => {
    let cancelled = false;
    let revalidation: Promise<void> | null = null;
    let revalidationQueued = false;

    const revalidate = () => {
      if (cancelled || !shouldLoadCatalogue || document.visibilityState !== "visible") return;
      if (revalidation) {
        revalidationQueued = true;
        return;
      }
      invalidateLiveProductsPublicationMarker(supabaseConfig);
      revalidation = (async () => {
        try {
          const result = await loadLiveProducts(supabaseConfig);
          if (!cancelled) {
            setProducts(result);
            setError(null);
            publishCatalogueUpdate(result);
          }
        } catch {
          // Keep the current catalogue visible during a background refresh
          // failure. The next foreground check or realtime reconnect retries.
        } finally {
          revalidation = null;
          if (revalidationQueued) {
            revalidationQueued = false;
            revalidate();
          }
        }
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") revalidate();
    };

    // A browser back/forward-cache restore can emit `pageshow` without the
    // visibility sequence, so treat it as another cheap freshness checkpoint.
    const handlePageShow = () => revalidate();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    const unsubscribe = subscribeToCataloguePublication(revalidate);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      unsubscribe();
    };
  }, [shouldLoadCatalogue]);

  const value = useMemo<SearchContextValue>(
    () => ({
      products,
      loadingProducts,
      error,
      selectedStores,
      toggleStore,
      dealFilter,
      setDealFilter,
      query,
      setQuery,
      isActive,
      hasOpenedSearch,
      focusSearchOnOpen,
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
      refreshCatalogue,
      openSearch: () => {
        setHasOpenedSearch(true);
        setPreserveSearchStateOnOpen(false);
        setFocusSearchOnOpen(true);
        setIsActive(true);
      },
      openSearchForFilter: (filter, options) => {
        setHasOpenedSearch(true);
        setQuery("");
        setDealFilter(filter);
        setPreserveSearchStateOnOpen(false);
        setFocusSearchOnOpen(options?.focus !== false);
        setIsActive(true);
      },
      closeSearch: () => {
        setQuery("");
        setFocusSearchOnOpen(true);
        setIsActive(false);
        setReturnToSearch(null);
        setPreserveSearchStateOnOpen(false);
      },
      returnToSearch,
      pauseForDealNavigation: (productId, store) => {
        setReturnToSearch({ productId, store });
        setPreserveSearchStateOnOpen(false);
      },
      finishDealNavigation: () => {
        setIsActive(false);
      },
      resumeAfterDealBack: () => {
        setHasOpenedSearch(true);
        setPreserveSearchStateOnOpen(true);
        setIsActive(true);
        setReturnToSearch(null);
      },
      preserveSearchStateOnOpen,
      isScannerOpen,
      hasOpenedScanner,
      openScanner: () => {
        setHasOpenedScanner(true);
        setIsScannerOpen(true);
      },
      closeScanner: () => setIsScannerOpen(false),
    }),
    [products, loadingProducts, error, selectedStores, toggleStore, dealFilter, query, isActive, hasOpenedSearch, focusSearchOnOpen, returnToSearch, preserveSearchStateOnOpen, isScannerOpen, hasOpenedScanner, refreshCatalogue]
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
