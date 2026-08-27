"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  isLiveProductsRefreshDue,
  loadLiveProducts,
  refreshLiveProducts,
  LIVE_PRODUCTS_AUTO_REFRESH_MS,
  describeFetchError,
  type ProductCard,
  type RefreshLiveProductsResult,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "./config";
import { publishCatalogueUpdate, subscribeToCatalogueUpdates } from "./catalogue-refresh";
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
   * instead of its back button). The full-screen search uses the accompanying
   * `preserveSearchStateOnOpen` flag to distinguish this resume from a fresh
   * search entry, so its selected tab and saved scroll position survive the
   * deal-page detour. */
  resumeAfterDealBack: () => void;
  /** True when the next search overlay opening is a return from a deal page,
   * rather than a fresh search entry. */
  preserveSearchStateOnOpen: boolean;
  /** True from the instant a card tap inside the search overlay calls
   * `pauseForDealNavigation` until the destination deal page's own mount
   * effect calls `clearDealNavigationPending` -- see `GlobalOverlays.tsx`'s
   * globally-mounted `<PageLoader>` (2026-08-11, fixing a real bug: users
   * briefly saw Home during this exact window). Root cause `PageLoader`'s
   * own 2026-08-10 doc comment didn't cover: `pauseForDealNavigation` sets
   * `isActive` false *synchronously*, in the same tick as the tap, which
   * starts `FullScreenSearch`'s 200ms opacity exit fade immediately --  but
   * `router.push(...)` (called right after, in `ProductListCard.goToDeal`)
   * isn't instant, since this card's `onClick` handler (not a `<Link>`)
   * never triggers Next.js's hover/viewport prefetch, so the destination
   * route can take meaningfully longer than 200ms to actually mount,
   * especially the first time it's visited in a `next dev` session (fresh
   * route compile). The deal page's own local `<PageLoader>` (still
   * correct, unchanged) only starts existing once THAT mount happens -- so
   * there was a real, unbounded gap between "search overlay finishes fading
   * out" and "deal page mounts its own cover" where nothing occluded Home
   * underneath. This flag plugs exactly that gap with a SEPARATE, globally-
   * mounted `<PageLoader>` that turns on before the fade starts (so it's
   * already opaque underneath the fading overlay) and only turns off once
   * the destination page itself has mounted and is covering the screen
   * with its own local `<PageLoader>` -- a clean handoff, since both render
   * the identical full-white-plus-logo visual, so having both mounted for
   * one frame during the handoff is invisible. */
  isDealNavigationPending: boolean;
  /** Called once, on mount, by the deal-assessment page -- see
   * `isDealNavigationPending`'s own doc comment above. */
  clearDealNavigationPending: () => void;
  isScannerOpen: boolean;
  openScanner: () => void;
  closeScanner: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

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
  const [returnToSearch, setReturnToSearch] = useState<PendingDealReturn | null>(null);
  const [preserveSearchStateOnOpen, setPreserveSearchStateOnOpen] = useState(false);
  const [isDealNavigationPending, setIsDealNavigationPending] = useState(false);
  // Guards the timeout safety-net below (peer review, 2026-08-11): a plain
  // counter, bumped on every `pauseForDealNavigation` call, so a stale
  // timer from an EARLIER tap can't wrongly clear a LATER, still-genuinely-
  // in-flight navigation if the user taps a second card within the first
  // one's own timeout window.
  const pendingNavRequestIdRef = useRef(0);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
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
    let cancelled = false;
    loadLiveProducts(supabaseConfig)
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
  }, [retryTick]);

  // Deal-detail targeted validation can update a single cached card without
  // downloading the full catalogue. Keep the global Check-deals/search state
  // in sync when that happens, so navigating back never restores the stale
  // verdict from before the detail page was opened.
  useEffect(() => subscribeToCatalogueUpdates((result) => {
    setProducts(result);
  }), []);

  // Refresh after a long-lived foreground session or a backgrounded app has
  // been away for six hours. The timer itself is local-only; the network
  // request is made only once `isLiveProductsRefreshDue()` confirms that the
  // persisted catalogue timestamp is old enough. Visibility handling covers
  // mobile browsers/webviews that suspend timers while backgrounded.
  useEffect(() => {
    let cancelled = false;
    let hiddenAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const maybeRefresh = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (!(await isLiveProductsRefreshDue()) || cancelled) return;
      try {
        await refreshCatalogue();
      } catch {
        // Keep the current catalogue visible during a background refresh
        // failure. The next foreground check or pull can retry it.
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void maybeRefresh().finally(schedule);
      }, LIVE_PRODUCTS_AUTO_REFRESH_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const inactiveFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (inactiveFor >= LIVE_PRODUCTS_AUTO_REFRESH_MS) void maybeRefresh();
    };

    // A browser back/forward-cache restore can emit `pageshow` without the
    // visibility sequence, so treat it as another cheap freshness checkpoint.
    const handlePageShow = () => void maybeRefresh();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    schedule();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      if (timer) clearTimeout(timer);
    };
  }, [refreshCatalogue]);

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
        setPreserveSearchStateOnOpen(false);
        setIsActive(true);
      },
      closeSearch: () => {
        setQuery("");
        setIsActive(false);
        setReturnToSearch(null);
        setPreserveSearchStateOnOpen(false);
      },
      returnToSearch,
      pauseForDealNavigation: (productId, store) => {
        setIsActive(false);
        setReturnToSearch({ productId, store });
        setPreserveSearchStateOnOpen(false);
        setIsDealNavigationPending(true);
        // Safety net (peer review, 2026-08-11): normally
        // `clearDealNavigationPending` (below) is what turns this back off,
        // called by the destination deal page's own mount effect. But if
        // that page never actually mounts -- the user hits back before the
        // route transition finishes, a chunk-load/network failure, the tab
        // loses focus mid-navigation -- nothing would ever clear it, and
        // this flag drives a full-screen opaque loader (GlobalOverlays.tsx)
        // that would then stay stuck forever, strictly worse than the
        // flash it exists to prevent. Self-heals after 6s if nothing else
        // cleared it first; the `requestId` check stops this from wrongly
        // cancelling a SECOND, still-legitimate navigation if another card
        // gets tapped within this window (its own call bumps the ref, so
        // this stale timer's captured id no longer matches by the time it
        // fires).
        const requestId = ++pendingNavRequestIdRef.current;
        setTimeout(() => {
          if (pendingNavRequestIdRef.current === requestId) setIsDealNavigationPending(false);
        }, 6000);
      },
      resumeAfterDealBack: () => {
        setPreserveSearchStateOnOpen(true);
        setIsActive(true);
        setReturnToSearch(null);
      },
      preserveSearchStateOnOpen,
      isDealNavigationPending,
      clearDealNavigationPending: () => setIsDealNavigationPending(false),
      isScannerOpen,
      openScanner: () => setIsScannerOpen(true),
      closeScanner: () => setIsScannerOpen(false),
    }),
    [products, loadingProducts, error, selectedStores, toggleStore, dealFilter, query, isActive, returnToSearch, preserveSearchStateOnOpen, isDealNavigationPending, isScannerOpen, refreshCatalogue]
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
