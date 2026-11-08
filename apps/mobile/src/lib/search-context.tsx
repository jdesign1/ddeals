"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  loadLiveProducts,
  refreshLiveProducts,
  describeFetchError,
  readCatalogueCache,
  readCatalogueCacheMetadata,
  type ProductCard,
  type RefreshLiveProductsResult,
  filterRecentlyVerifiedSpecials,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "./config";
import { publishCatalogueUpdate, subscribeToCatalogueUpdates } from "./catalogue-refresh";
import type { DealFilter } from "./deal-filters";
import type { CheckDealsSortBy } from "./deal-sorting";

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

type NewSpecialsSearchMode = "all" | "keys";

interface SearchContextValue {
  products: ProductCard[];
  loadingProducts: boolean;
  /** True after the authoritative catalogue request has settled. */
  catalogueLiveLoaded: boolean;
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
  openSearchForFilter: (
    filter: DealFilter,
    options?: {
      focus?: boolean;
      dealKeys?: string[];
      sortBy?: CheckDealsSortBy;
      category?: string;
      brandKey?: string;
      showNewToYouTab?: boolean;
      preserveSelectedStores?: boolean;
    },
  ) => void;
  /** Clears the temporary new-specials scope while keeping the search open. */
  clearNewSpecialsFilter: () => void;
  /** Exact product/store deal keys selected by the new-specials digest. */
  newSpecialDealKeys: string[] | null;
  /** Whether a fresh search should use pending new specials, all deals, or exact keys. */
  newSpecialsSearchMode: NewSpecialsSearchMode;
  /** Shows the New to you label only for the explicit Standout Specials See all entry point. */
  newSpecialsShowTab: boolean;
  /** Publication identity for the last validated catalogue snapshot. */
  cataloguePublicationKey: string | null;
  /** True only when the publication marker was available for that snapshot. */
  cataloguePublicationComplete: boolean;
  /** Optional sort used only for the next fresh search opening. */
  searchSortOverride: CheckDealsSortBy | null;
  /** Optional category used only for the next fresh search opening. */
  searchCategoryOverride: string | null;
  /** Optional exact brand used only for the next fresh search opening. */
  searchBrandOverride: string | null;
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

/** Catalogue-only slice for global consumers that do not need search UI state. */
export interface SearchCatalogueContextValue {
  products: ProductCard[];
  loadingProducts: boolean;
  catalogueLiveLoaded: boolean;
  error: string | null;
  retry: () => void;
  cataloguePublicationKey: string | null;
  cataloguePublicationComplete: boolean;
}

/** Shared browse filters used by Check Deals and full-screen search. */
export interface SearchBrowseContextValue {
  selectedStores: string[];
  toggleStore: (storeId: string) => void;
  dealFilter: DealFilter;
  setDealFilter: (filter: DealFilter) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);
const SearchCatalogueContext = createContext<SearchCatalogueContextValue | null>(null);
const SearchBrowseContext = createContext<SearchBrowseContextValue | null>(null);
interface SearchNavigationContextValue {
  isActive: boolean;
  closeSearch: () => void;
  openSearch: () => void;
  openSearchForFilter: SearchContextValue["openSearchForFilter"];
  returnToSearch: PendingDealReturn | null;
  resumeAfterDealBack: () => void;
  isScannerOpen: boolean;
  hasOpenedScanner: boolean;
  openScanner: () => void;
  closeScanner: () => void;
}

const SearchNavigationContext = createContext<SearchNavigationContextValue | null>(null);
export interface SearchOverlayContextValue {
  focusSearchOnOpen: boolean;
  newSpecialDealKeys: string[] | null;
  newSpecialsSearchMode: NewSpecialsSearchMode;
  newSpecialsShowTab: boolean;
  searchSortOverride: CheckDealsSortBy | null;
  searchCategoryOverride: string | null;
  searchBrandOverride: string | null;
  clearNewSpecialsFilter: () => void;
  pauseForDealNavigation: (productId: string, store: string) => void;
  finishDealNavigation: () => void;
  preserveSearchStateOnOpen: boolean;
}

const SearchOverlayContext = createContext<SearchOverlayContextValue | null>(null);
interface SearchInputContextValue {
  query: string;
  setQuery: (value: string) => void;
  isActive: boolean;
  openSearch: () => void;
  openSearchForFilter: SearchContextValue["openSearchForFilter"];
}

const SearchInputContext = createContext<SearchInputContextValue | null>(null);
interface SearchShellContextValue {
  dealFilter: DealFilter;
  refreshCatalogue: () => Promise<RefreshLiveProductsResult>;
}

const SearchShellContext = createContext<SearchShellContextValue | null>(null);

const INITIAL_CATALOGUE_RETRY_DELAYS_MS = [500, 1500];

interface CataloguePublicationState {
  key: string | null;
  complete: boolean;
}

async function readCurrentCataloguePublication(): Promise<CataloguePublicationState> {
  const metadata = await readCatalogueCacheMetadata();
  const hasValidatedMarker = metadata?.complete === true
    && typeof metadata.sourceUpdatedAt === "number"
    && Number.isFinite(metadata.sourceUpdatedAt);
  return hasValidatedMarker
    ? { key: String(metadata.sourceUpdatedAt), complete: true }
    : { key: null, complete: false };
}

function addRetryJitter(delayMs: number): number {
  // Avoid synchronising a large group of clients after the same CDN or
  // database incident. Full jitter is bounded to the base delay so the
  // retry remains quick for a user who is actively waiting for the catalogue.
  return delayMs + Math.floor(Math.random() * delayMs);
}

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
      await new Promise((resolve) => window.setTimeout(resolve, addRetryJitter(retryDelay)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to load specials");
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [catalogueLiveLoaded, setCatalogueLiveLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shared while a search session is open so Check deals and the full-screen
  // search overlay agree on the supermarket and deal-tab scope. Closing Search
  // resets both transient values so Check deals returns to its neutral view.
  const [selectedStores, setSelectedStores] = useState<string[]>(["all"]);
  const [dealFilter, setDealFilter] = useState<DealFilter>("all");
  const [query, setQuery] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [hasOpenedSearch, setHasOpenedSearch] = useState(false);
  const [focusSearchOnOpen, setFocusSearchOnOpen] = useState(true);
  const [newSpecialDealKeys, setNewSpecialDealKeys] = useState<string[] | null>(null);
  const [newSpecialsSearchMode, setNewSpecialsSearchMode] = useState<NewSpecialsSearchMode>("all");
  const [newSpecialsShowTab, setNewSpecialsShowTab] = useState(false);
  const [cataloguePublicationKey, setCataloguePublicationKey] = useState<string | null>(null);
  const [cataloguePublicationComplete, setCataloguePublicationComplete] = useState(false);
  const [searchSortOverride, setSearchSortOverride] = useState<CheckDealsSortBy | null>(null);
  const [searchCategoryOverride, setSearchCategoryOverride] = useState<string | null>(null);
  const [searchBrandOverride, setSearchBrandOverride] = useState<string | null>(null);
  const [returnToSearch, setReturnToSearch] = useState<PendingDealReturn | null>(null);
  const [preserveSearchStateOnOpen, setPreserveSearchStateOnOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [hasOpenedScanner, setHasOpenedScanner] = useState(false);
  const pathname = usePathname();
  // All Checks and Deal Stats also need the shared catalogue: the former
  // gap-fills checked products that have rolled off specials, while the
  // latter computes current market trends. Loading it on direct visits keeps
  // those routes correct without relying on Home having mounted first.
  const shouldLoadCatalogue = pathname === "/" || pathname === "/specials" || pathname === "/history" || pathname === "/me" || isActive;
  // Bumped by `retry()` below to force the effect to re-run. A plain counter
  // rather than calling the fetch directly from `retry()` keeps one owner for
  // the load lifecycle and lets the in-flight ref deduplicate route changes.
  const [retryTick, setRetryTick] = useState(0);
  const catalogueLoadAttemptRef = useRef<number | null>(null);
  const catalogueLoadInFlightRef = useRef<Promise<void> | null>(null);
  const catalogueLoadSucceededRef = useRef(false);
  const cataloguePublicationRef = useRef<CataloguePublicationState>({ key: null, complete: false });

  const setCataloguePublication = useCallback((publication: CataloguePublicationState) => {
    cataloguePublicationRef.current = publication;
    setCataloguePublicationKey(publication.key);
    setCataloguePublicationComplete(publication.complete);
  }, []);

  const refreshCatalogue = useCallback(async (): Promise<RefreshLiveProductsResult> => {
    const result = await refreshLiveProducts(supabaseConfig);
    catalogueLoadSucceededRef.current = true;
    setProducts(result.products);
    const publication = await readCurrentCataloguePublication();
    setCataloguePublication(publication);
    setCatalogueLiveLoaded(true);
    setError(null);
    publishCatalogueUpdate(result.products);
    return result;
  }, [setCataloguePublication]);

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

  const openSearch = useCallback(() => {
    setHasOpenedSearch(true);
    setNewSpecialDealKeys(null);
    // Opening the global search bar is a neutral browse action. A pending
    // new-specials digest must not silently narrow the catalogue; the
    // shopper can still enter New to you from the explicit Check Deals
    // Top Savers entry point.
    setNewSpecialsSearchMode("all");
    setNewSpecialsShowTab(false);
    setSearchSortOverride(null);
    setSearchCategoryOverride(null);
    setSearchBrandOverride(null);
    setPreserveSearchStateOnOpen(false);
    setFocusSearchOnOpen(true);
    setIsActive(true);
  }, []);

  const openSearchForFilter = useCallback<SearchContextValue["openSearchForFilter"]>((filter, options) => {
    setHasOpenedSearch(true);
    setQuery("");
    setDealFilter(filter);
    const hasDealKeys = Boolean(options?.dealKeys?.length);
    setNewSpecialsSearchMode(hasDealKeys ? "keys" : "all");
    setNewSpecialsShowTab(hasDealKeys && options?.showNewToYouTab === true);
    setNewSpecialDealKeys(hasDealKeys ? options?.dealKeys ?? null : null);
    setSearchSortOverride(options?.sortBy ?? null);
    setSearchCategoryOverride(options?.category ?? null);
    setSearchBrandOverride(options?.brandKey ?? null);
    // The digest count spans every supermarket. Reset a previous search
    // preference here so its "View all" promise cannot land on a
    // smaller, hidden subset of the selected deals.
    if (options?.dealKeys?.length && options.preserveSelectedStores !== true) setSelectedStores(["all"]);
    setPreserveSearchStateOnOpen(false);
    setFocusSearchOnOpen(options?.focus !== false);
    setIsActive(true);
  }, []);

  const closeSearch = useCallback(() => {
    setQuery("");
    setNewSpecialDealKeys(null);
    setNewSpecialsSearchMode("all");
    setNewSpecialsShowTab(false);
    setSearchSortOverride(null);
    setSearchCategoryOverride(null);
    setSearchBrandOverride(null);
    setSelectedStores(["all"]);
    setDealFilter("all");
    setFocusSearchOnOpen(true);
    setIsActive(false);
    setReturnToSearch(null);
    setPreserveSearchStateOnOpen(false);
  }, []);

  const openScanner = useCallback(() => {
    setHasOpenedScanner(true);
    setIsScannerOpen(true);
  }, []);

  const closeScanner = useCallback(() => setIsScannerOpen(false), []);

  useEffect(() => {
    if (!shouldLoadCatalogue) return;
    if (catalogueLoadInFlightRef.current) return;
    if (catalogueLoadAttemptRef.current === retryTick) return;

    catalogueLoadAttemptRef.current = retryTick;
    let liveResultSucceeded = false;
    let displayedCachedProducts = false;

    // Let a valid local snapshot win the race to first paint. The normal
    // loader still runs immediately and remains authoritative when it
    // resolves; this only removes the IndexedDB/publication-marker wait from
    // the warm-launch critical path. The cache reader applies the same
    // version and retailer-freshness checks as loadLiveProducts().
    const loadRequest = (async () => {
      void readCatalogueCache().then((cached) => {
        if (liveResultSucceeded || !cached?.length) return;
        displayedCachedProducts = true;
        setProducts(cached);
        setError(null);
        setLoadingProducts(false);
      });

      try {
        const result = await loadLiveProductsWithRetry();
        liveResultSucceeded = true;
        catalogueLoadSucceededRef.current = true;
        setProducts(result);
        setError(null);
        setLoadingProducts(false);
        const publication = await readCurrentCataloguePublication();
        setCataloguePublication(publication);
      } catch (err: unknown) {
        if (!displayedCachedProducts) setError(describeFetchError(err, "Failed to load specials"));
      } finally {
        setCatalogueLiveLoaded(true);
        setLoadingProducts(false);
      }
    })();
    catalogueLoadInFlightRef.current = loadRequest;
    void loadRequest.finally(() => {
      catalogueLoadInFlightRef.current = null;
    });
  }, [retryTick, setCataloguePublication, shouldLoadCatalogue]);

  useEffect(() => {
    // If a catalogue attempt failed while this provider was off a catalogue
    // route, allow the next visit to recover automatically. A successful
    // session load remains cached and should not be repeated on every detour.
    if (!shouldLoadCatalogue && !catalogueLoadSucceededRef.current) {
      catalogueLoadAttemptRef.current = null;
    }
  }, [shouldLoadCatalogue]);

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

  // Revalidate at foreground checkpoints instead of holding one database
  // Realtime subscription per active client. The publication marker is
  // browser/CDN-cacheable and the full catalogue is still fetched only when
  // its version advances, while a short jitter avoids synchronising a large
  // group of clients after a resume or deploy.
  useEffect(() => {
    let cancelled = false;
    let revalidation: Promise<void> | null = null;
    let revalidationQueued = false;
    let checkpointTimer: number | null = null;

    const revalidate = () => {
      if (cancelled || !shouldLoadCatalogue || document.visibilityState !== "visible") return;
      if (revalidation) {
        revalidationQueued = true;
        return;
      }
      revalidation = (async () => {
        try {
          const result = await loadLiveProducts(supabaseConfig);
          const publication = await readCurrentCataloguePublication();
          if (!cancelled) {
            const publicationUnchanged = publication.complete
              && publication.key !== null
              && cataloguePublicationRef.current.complete
              && cataloguePublicationRef.current.key === publication.key;
            if (publicationUnchanged) {
              // The loader may return a fresh IndexedDB clone even when the
              // publication is unchanged. Preserve the current array so all
              // catalogue consumers avoid a full derivation pass; the local
              // expiry filter still removes deals that age out while open.
              setProducts((current) => filterRecentlyVerifiedSpecials(current));
            } else {
              setProducts(result);
              setCataloguePublication(publication);
              publishCatalogueUpdate(result);
            }
            setCatalogueLiveLoaded(true);
            setError(null);
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

    const scheduleRevalidate = () => {
      if (checkpointTimer !== null) window.clearTimeout(checkpointTimer);
      checkpointTimer = window.setTimeout(() => {
        checkpointTimer = null;
        revalidate();
      }, 250 + Math.floor(Math.random() * 750));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleRevalidate();
    };

    // A browser back/forward-cache restore can emit `pageshow` without the
    // visibility sequence, so treat it as another cheap freshness checkpoint.
    const handlePageShow = () => scheduleRevalidate();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      if (checkpointTimer !== null) window.clearTimeout(checkpointTimer);
    };
  }, [setCataloguePublication, shouldLoadCatalogue]);

  const retry = useCallback(() => {
    setError(null);
    setLoadingProducts(true);
    setCatalogueLiveLoaded(false);
    catalogueLoadSucceededRef.current = false;
    setRetryTick((t) => t + 1);
  }, []);

  const clearNewSpecialsFilter = useCallback(() => {
    setNewSpecialsSearchMode("all");
    setNewSpecialDealKeys(null);
    setNewSpecialsShowTab(false);
    setSearchSortOverride(null);
  }, []);

  const pauseForDealNavigation = useCallback((productId: string, store: string) => {
    setReturnToSearch({ productId, store });
    setPreserveSearchStateOnOpen(false);
  }, []);

  const finishDealNavigation = useCallback(() => {
    setIsActive(false);
  }, []);

  const resumeAfterDealBack = useCallback(() => {
    setHasOpenedSearch(true);
    setPreserveSearchStateOnOpen(true);
    setIsActive(true);
    setReturnToSearch(null);
  }, []);

  const value = useMemo<SearchContextValue>(
    () => ({
      products,
      loadingProducts,
      catalogueLiveLoaded,
      error,
      selectedStores,
      toggleStore,
      dealFilter,
      setDealFilter,
      newSpecialDealKeys,
      newSpecialsSearchMode,
      newSpecialsShowTab,
      cataloguePublicationKey,
      cataloguePublicationComplete,
      searchSortOverride,
      searchCategoryOverride,
      searchBrandOverride,
      query,
      setQuery,
      isActive,
      hasOpenedSearch,
      focusSearchOnOpen,
      retry,
      refreshCatalogue,
      openSearch,
      openSearchForFilter,
      clearNewSpecialsFilter,
      closeSearch,
      returnToSearch,
      pauseForDealNavigation,
      finishDealNavigation,
      resumeAfterDealBack,
      preserveSearchStateOnOpen,
      isScannerOpen,
      hasOpenedScanner,
      openScanner,
      closeScanner,
    }),
    [products, loadingProducts, catalogueLiveLoaded, error, selectedStores, toggleStore, dealFilter, query, isActive, hasOpenedSearch, focusSearchOnOpen, newSpecialDealKeys, newSpecialsSearchMode, newSpecialsShowTab, cataloguePublicationKey, cataloguePublicationComplete, searchSortOverride, searchCategoryOverride, searchBrandOverride, returnToSearch, preserveSearchStateOnOpen, isScannerOpen, hasOpenedScanner, retry, refreshCatalogue, openSearch, openSearchForFilter, clearNewSpecialsFilter, closeSearch, pauseForDealNavigation, finishDealNavigation, resumeAfterDealBack, openScanner, closeScanner]
  );

  const catalogueValue = useMemo<SearchCatalogueContextValue>(
    () => ({
      products,
      loadingProducts,
      catalogueLiveLoaded,
      error,
      retry,
      cataloguePublicationKey,
      cataloguePublicationComplete,
    }),
    [catalogueLiveLoaded, cataloguePublicationComplete, cataloguePublicationKey, error, loadingProducts, products, retry],
  );

  const browseValue = useMemo<SearchBrowseContextValue>(
    () => ({ selectedStores, toggleStore, dealFilter, setDealFilter }),
    [selectedStores, toggleStore, dealFilter, setDealFilter],
  );

  const navigationValue = useMemo<SearchNavigationContextValue>(
    () => ({ isActive, closeSearch, openSearch, openSearchForFilter, returnToSearch, resumeAfterDealBack, isScannerOpen, hasOpenedScanner, openScanner, closeScanner }),
    [isActive, closeSearch, openSearch, openSearchForFilter, returnToSearch, resumeAfterDealBack, isScannerOpen, hasOpenedScanner, openScanner, closeScanner],
  );
  const overlayValue = useMemo<SearchOverlayContextValue>(
    () => ({
      focusSearchOnOpen,
      newSpecialDealKeys,
      newSpecialsSearchMode,
      newSpecialsShowTab,
      searchSortOverride,
      searchCategoryOverride,
      searchBrandOverride,
      clearNewSpecialsFilter,
      pauseForDealNavigation,
      finishDealNavigation,
      preserveSearchStateOnOpen,
    }),
    [
      clearNewSpecialsFilter,
      finishDealNavigation,
      focusSearchOnOpen,
      newSpecialDealKeys,
      newSpecialsSearchMode,
      newSpecialsShowTab,
      pauseForDealNavigation,
      preserveSearchStateOnOpen,
      searchCategoryOverride,
      searchBrandOverride,
      searchSortOverride,
    ],
  );
  const inputValue = useMemo<SearchInputContextValue>(
    () => ({ query, setQuery, isActive, openSearch, openSearchForFilter }),
    [query, setQuery, isActive, openSearch, openSearchForFilter],
  );
  const shellValue = useMemo<SearchShellContextValue>(
    () => ({ dealFilter, refreshCatalogue }),
    [dealFilter, refreshCatalogue],
  );

  return (
    <SearchContext.Provider value={value}>
      <SearchCatalogueContext.Provider value={catalogueValue}>
        <SearchBrowseContext.Provider value={browseValue}>
          <SearchNavigationContext.Provider value={navigationValue}>
            <SearchInputContext.Provider value={inputValue}>
              <SearchOverlayContext.Provider value={overlayValue}>
                <SearchShellContext.Provider value={shellValue}>
                  {children}
                </SearchShellContext.Provider>
              </SearchOverlayContext.Provider>
            </SearchInputContext.Provider>
          </SearchNavigationContext.Provider>
        </SearchBrowseContext.Provider>
      </SearchCatalogueContext.Provider>
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within a SearchProvider");
  return ctx;
}

export function useSearchCatalogue(): SearchCatalogueContextValue {
  const ctx = useContext(SearchCatalogueContext);
  if (!ctx) throw new Error("useSearchCatalogue must be used within SearchProvider");
  return ctx;
}

export function useSearchBrowse(): SearchBrowseContextValue {
  const ctx = useContext(SearchBrowseContext);
  if (!ctx) throw new Error("useSearchBrowse must be used within SearchProvider");
  return ctx;
}

export function useSearchNavigation(): SearchNavigationContextValue {
  const ctx = useContext(SearchNavigationContext);
  if (!ctx) throw new Error("useSearchNavigation must be used within a SearchProvider");
  return ctx;
}

export function useSearchInput(): SearchInputContextValue {
  const ctx = useContext(SearchInputContext);
  if (!ctx) throw new Error("useSearchInput must be used within a SearchProvider");
  return ctx;
}

export function useSearchOverlay(): SearchOverlayContextValue {
  const ctx = useContext(SearchOverlayContext);
  if (!ctx) throw new Error("useSearchOverlay must be used within a SearchProvider");
  return ctx;
}

export function useSearchShell(): SearchShellContextValue {
  const ctx = useContext(SearchShellContext);
  if (!ctx) throw new Error("useSearchShell must be used within a SearchProvider");
  return ctx;
}
