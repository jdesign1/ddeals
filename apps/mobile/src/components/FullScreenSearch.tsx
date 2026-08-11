"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowLeft, ChevronDown, ScanBarcode, Search, X } from "lucide-react";
import type { ProductCard as ProductCardData, CurrentDeal } from "@dodgey-deals/shared";
import { STORE_DISPLAY_FALLBACK, storeMatchesFilter, deriveAvailableStoreKeys, groupCategory } from "@dodgey-deals/shared";
import ProductListCard from "@/components/ProductListCard";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import StorePill from "@/components/StorePill";
import { useSearch } from "@/lib/search-context";

/**
 * Full-screen search overlay — ported from Prototype/index.html's
 * `SearchTab`, specifically its `isSearchActive` render branch (lines
 * ~2416-2871: the persistent full-screen bar, the pre-3-character
 * "Popular specials now" / "Dodgy deals now" browse view with its own
 * store/category/sort controls, and the post-3-character "Results for
 * '...'" list with the same controls). Opens as soon as the search bar (or
 * the global search icon in AppHeader) is focused/tapped on ANY screen, not
 * just Home — see `lib/search-context.tsx`.
 *
 * Mounted exactly once, globally, in `layout.tsx` via
 * `components/GlobalOverlays.tsx` (2026-08-09) — reads every bit of its
 * state from `useSearch()` (products/loading/error, query, isActive/
 * close/openScanner) instead of taking props, matching how `AppHeader`
 * already reaches into `useAuth()`/`useHeaderOverride()` directly rather
 * than being prop-driven from `layout.tsx`. An earlier version of this
 * file was mounted only inside Home's own `page.tsx` and took all of this
 * as props — moved globally, per Jay's ask, so the overlay is reachable
 * from `/specials`, `/lists`, `/me`, not just `/`.
 *
 * Not conditionally instantiated (stays mounted even while closed, like
 * `ScannerModal.tsx`), so `selectedStores`/`sortBy`/tab/category state
 * persists across open-close cycles the same way it does in the prototype
 * — there, `SearchTab` itself never unmounts (the "active" view is just a
 * JSX branch), so this mirrors that by keeping the component alive and
 * only animating the overlay's opacity via `isActive`.
 *
 * Deliberate differences from the prototype, flagged rather than silently
 * dropped:
 *  - No debounced query (the prototype's 150ms debounce exists because it
 *    re-scans a ~12.7k-item live catalogue on every keystroke; this app's
 *    search runs over the same already-loaded, specials-only `products`
 *    array, typically a few hundred to low thousands of rows, cheap enough
 *    to filter synchronously).
 *  - No typo-tolerant fuzzy fallback (`isFuzzyProductMatch` /
 *    `levenshteinDistance` in the prototype) -- whole-word/substring
 *    relevance ranking is ported (category > name > brand > substring), the
 *    Levenshtein typo-correction tier is not; a meaningful chunk of extra
 *    code for a nicety that matters most on the prototype's much larger
 *    catalogue, and this app's search never had it either.
 *  - No branch personalisation (`usePersonalised`/`selectedBranches`) --
 *    same simplification page.tsx's own doc comment already established;
 *    store labels come from `STORE_DISPLAY_FALLBACK` directly.
 *  - Store filter pills are derived from the live `products` prop via
 *    `deriveAvailableStoreKeys` (only shows stores that actually have
 *    current specials, including SuperValue if it ever does) rather than
 *    the prototype's hardcoded 4-store list. Both pill rows (pre- and
 *    post-3-character) now render via the shared `StorePill` component
 *    (2026-08-09, per Jay's explicit ask for "the same component pills as
 *    on home page") -- the prototype actually styles its two rows
 *    differently (per-store brand color pre-3-char vs. flat black +
 *    uppercase + a selected-dot indicator post-3-char, Prototype/
 *    index.html:2497-2511 vs. 2689-2694), but this intentionally unifies
 *    both to Home's own look instead, superseding that prototype asymmetry
 *    on Jay's direct instruction rather than by accident.
 *  - The full-screen bar's trailing button is a scan-barcode button
 *    (`openScanner`), not the prototype's dismiss-keyboard X -- also a
 *    direct, deliberate override of the prototype (whose own comment
 *    reasoned the scan button "only makes sense on the home bar"); Jay
 *    asked for it back here specifically, so tapping it opens the same
 *    `ScannerModal` Home's bar does, layered on top of this overlay rather
 *    than replacing it.
 *  - "Popular specials now" ranks by *discount* (prototype's own
 *    `popularSpecials` picks the biggest-discount deal per product); the
 *    post-3-character results list ranks by *cheapest applicable price*
 *    (prototype's `sortedProducts`) -- both intentionally ported exactly as
 *    asymmetric as the prototype has them, not "fixed" to be consistent.
 *  - The post-3-character results section's Categories/Sort controls sit
 *    directly above the results grid (2026-08-09, per Jay's ask to match
 *    "the home page" -- see TrendingSection/MyListSection in page.tsx,
 *    both put their own count+Sort row immediately above their grid), not
 *    up near the tabs the way the prototype places them
 *    (Prototype/index.html:2642-2665, well above the store-pill row). The
 *    "Filter by Supermarket:" label the prototype prints above its pill
 *    row is also dropped entirely, per the same ask.
 *  - Product cards reuse this app's real `ProductListCard` (already the
 *    ported version of the prototype's shared `ProductCard`, per its own
 *    doc comment) instead of re-porting a second copy here.
 */

interface PopularEntry {
  product: ProductCardData;
  bestDeal: CurrentDeal;
}

type PopularTab = "specials" | "dodgy";
type PopularSortBy = "discount" | "dodgy" | "recent" | "price-desc" | "price-asc";
type PriceFilter = "specials" | "dodgy";
type ResultsSortBy = "cheapest" | "discount" | "dodgy-rating";

const CATEGORY_SECTIONS: { title: string; categories: string[] }[] = [
  { title: "Fresh", categories: ["Fruit & veg", "Meat & seafood", "Fridge, deli & eggs", "Bakery", "Frozen & chilled"] },
  { title: "Grocery & drinks", categories: ["Pantry & grocery", "Drinks", "Beer & wine", "Snacks & treats"] },
  { title: "Household & care", categories: ["Health & household", "Baby & toddler", "Pet"] },
];

const POPULAR_PAGE_SIZE_SPECIALS = 6;
const POPULAR_PAGE_SIZE_DODGY = 24;
const SEARCH_RESULTS_PAGE_SIZE = 30;

// Strips everything but letters/numbers, so punctuation/spacing differences
// between how a product is named and how a shopper types it don't cause
// false misses -- ported from Prototype/index.html's `normalizeSearchText`.
const normalizeSearchText = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Whole-word tokens, ported from the prototype's `tokenizeSearchText`.
const tokenizeSearchText = (s: string | null | undefined) => (s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Relevance tiering, ported from Prototype/index.html's `getSearchRelevance`
 * (Levenshtein typo-tolerance tier omitted, see this file's doc comment):
 * a whole-word category match beats a whole-word name match beats a
 * whole-word brand match beats a plain substring match, so the actual
 * "Milk"/"Butter" category items outrank incidental mentions ("Butter
 * Chicken" sauce, "Milky" candy) regardless of price-based sort.
 */
function getSearchRelevance(product: ProductCardData, query: string): number {
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) return 1;
  const isWholeWordMatch = (text: string | null | undefined) => {
    const tokens = tokenizeSearchText(text);
    return queryTokens.every((qt) => tokens.includes(qt));
  };
  if (isWholeWordMatch(product.category)) return 4;
  if (isWholeWordMatch(product.name)) return 3;
  if (isWholeWordMatch(product.brand)) return 2;
  return 1;
}

function matchesAnySelectedStore(storeName: string, selectedStores: string[]): boolean {
  return selectedStores.includes("all") || selectedStores.some((s) => storeMatchesFilter(storeName, s));
}

function applicableDealsFor(product: ProductCardData, selectedStores: string[]): CurrentDeal[] {
  return product.currentDeals.filter((d) => matchesAnySelectedStore(d.store, selectedStores));
}

/** Cheapest deal among stores matching the current filter -- ported from
 * the results section's per-item `bestDeal` calc (falls back to the
 * unfiltered pool's first entry when the filter excludes everything, same
 * fallback the prototype uses). */
function cheapestApplicableDeal(product: ProductCardData, selectedStores: string[]): CurrentDeal {
  const applicable = applicableDealsFor(product, selectedStores);
  const seed = applicable[0] ?? product.currentDeals[0];
  return applicable.reduce((lowest, cur) => (cur.price < lowest.price ? cur : lowest), seed);
}

/** Other applicable stores also on special right now, excluding `shownDeal`'s
 * own store -- ported from the results section's `alsoSpecialStores` calc. */
function alsoSpecialStoresForResults(product: ProductCardData, shownDeal: CurrentDeal, selectedStores: string[]): string[] {
  const applicable = applicableDealsFor(product, selectedStores);
  const pool = applicable.length > 0 ? applicable : product.currentDeals;
  return [...new Set(pool.filter((d) => d.isOnSpecial !== false && d.store !== shownDeal.store).map((d) => d.store))];
}

/** Same idea for the pre-3-character "Popular specials" list -- ported
 * verbatim, deliberately NOT filtered by the store selection (the prototype
 * doesn't filter it there either). */
function alsoSpecialStoresForPopular(product: ProductCardData, shownDeal: CurrentDeal): string[] {
  return [...new Set(product.currentDeals.filter((d) => d.isOnSpecial !== false && d.store !== shownDeal.store).map((d) => d.store))];
}

export default function FullScreenSearch() {
  const {
    products,
    loadingProducts: loading,
    error,
    retry,
    query,
    setQuery,
    isActive: isOpen,
    closeSearch,
    pauseForDealNavigation,
    openScanner,
  } = useSearch();

  // Scroll position (2026-08-10, per Jay's ask to keep it across a
  // deal-page detour): the scrollable results container below unmounts
  // each time the overlay closes (`AnimatePresence` removing the
  // `motion.div`, see its own comment), which resets native `scrollTop` --
  // this component itself doesn't unmount, though (globally mounted, see
  // this file's own header comment), so a plain ref here survives that and
  // lets `restoreScrollOnOpen` below put it back. Tracked continuously via
  // `onScroll` rather than only captured at deal-navigation time, so it
  // behaves the same regardless of *why* the overlay closed.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  useLayoutEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = lastScrollTopRef.current;
    }
  }, [isOpen]);

  const [selectedStores, setSelectedStores] = useState<string[]>(["all"]);
  const [resultsSortBy, setResultsSortBy] = useState<ResultsSortBy>("cheapest");
  // Defaults to "dodgy" (2026-08-10, per Jay's ask for the full-screen search
  // screen to open on the Dodgy tab) -- kept in sync with `popularSortBy`'s
  // own default below and `handleBack`'s reset value further down.
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("dodgy");
  const [resultsCategoryFilter, setResultsCategoryFilter] = useState<string[]>([]);
  const [isSearchResultsExpanded, setIsSearchResultsExpanded] = useState(false);

  const [popularTab, setPopularTab] = useState<PopularTab>("dodgy");
  // "recent" to match the tab-click handler below, which sets this same
  // sort whenever the Dodgy tab is selected -- keeps the initial render
  // consistent with what clicking the (now-default) tab would produce.
  const [popularSortBy, setPopularSortBy] = useState<PopularSortBy>("recent");
  const [popularCategoryFilter, setPopularCategoryFilter] = useState<string[]>([]);
  const [isPopularExpanded, setIsPopularExpanded] = useState(false);

  const [categorySheetTarget, setCategorySheetTarget] = useState<"popular" | "results" | null>(null);
  const activeCategoryFilter = categorySheetTarget === "results" ? resultsCategoryFilter : popularCategoryFilter;
  const setActiveCategoryFilter = categorySheetTarget === "results" ? setResultsCategoryFilter : setPopularCategoryFilter;
  const toggleActiveCategory = (cat: string) =>
    setActiveCategoryFilter((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));

  const trimmedQuery = query.trim();

  // Reset "show all" expansion whenever the inputs that change the result
  // set change -- ported from the prototype's own reset effect (there keyed
  // on the debounced query; here on the query directly, see doc comment).
  useEffect(() => {
    setIsSearchResultsExpanded(false);
  }, [trimmedQuery, selectedStores, resultsSortBy, priceFilter, resultsCategoryFilter]);

  const availableStoreKeys = useMemo(() => deriveAvailableStoreKeys(products), [products]);
  const storeOptions = useMemo(
    () => [{ id: "all", label: "All" }, ...availableStoreKeys.map((key) => ({ id: key, label: STORE_DISPLAY_FALLBACK[key] || key }))],
    [availableStoreKeys]
  );

  const homeCategories = useMemo(
    () => [...new Set(products.map((p) => groupCategory(p.category)).filter(Boolean))].sort(),
    [products]
  );

  const handleStoreToggle = (storeId: string) => {
    if (storeId === "all") {
      setSelectedStores(["all"]);
      return;
    }
    setSelectedStores((prev) => {
      let next = prev.includes("all") ? [storeId] : [...prev];
      if (!prev.includes("all")) {
        next = next.includes(storeId) ? next.filter((id) => id !== storeId) : [...next, storeId];
      }
      return next.length === 0 ? ["all"] : next;
    });
  };

  // Popular specials -- best (biggest-discount) deal per product, across
  // whatever stores are selected. Shown before the user has typed 3+
  // characters, so there's something to browse rather than a dead end.
  const popularSpecials = useMemo<PopularEntry[]>(() => {
    const out: PopularEntry[] = [];
    for (const product of products) {
      const specialDeals = product.currentDeals.filter((d) => d.isOnSpecial !== false && matchesAnySelectedStore(d.store, selectedStores));
      if (specialDeals.length === 0) continue;
      const bestDeal = specialDeals.reduce((best, d) => (d.discountPercentage > best.discountPercentage ? d : best), specialDeals[0]);
      out.push({ product, bestDeal });
    }
    return out.sort((a, b) => b.bestDeal.discountPercentage - a.bestDeal.discountPercentage);
  }, [products, selectedStores]);

  const sortedPopularSpecials = useMemo(() => {
    const filtered = popularSpecials.filter(
      ({ product, bestDeal }) =>
        (popularTab !== "dodgy" || bestDeal.dealType === "Dodgy Deal") &&
        (popularCategoryFilter.length === 0 || popularCategoryFilter.includes(groupCategory(product.category)))
    );
    const sorted = [...filtered];
    if (popularTab === "dodgy") {
      if (popularSortBy === "recent") {
        sorted.sort((a, b) => new Date(b.bestDeal.saleStartedAt || 0).getTime() - new Date(a.bestDeal.saleStartedAt || 0).getTime());
      } else if (popularSortBy === "price-desc") {
        sorted.sort((a, b) => b.bestDeal.price - a.bestDeal.price);
      } else if (popularSortBy === "price-asc") {
        sorted.sort((a, b) => a.bestDeal.price - b.bestDeal.price);
      }
    } else if (popularSortBy === "dodgy") {
      sorted.sort((a, b) => (b.bestDeal.dealType === "Dodgy Deal" ? 1 : 0) - (a.bestDeal.dealType === "Dodgy Deal" ? 1 : 0));
    }
    return sorted;
  }, [popularSpecials, popularSortBy, popularTab, popularCategoryFilter]);

  const popularPageSize = popularTab === "dodgy" ? POPULAR_PAGE_SIZE_DODGY : POPULAR_PAGE_SIZE_SPECIALS;
  const visiblePopularSpecials = isPopularExpanded ? sortedPopularSpecials : sortedPopularSpecials.slice(0, popularPageSize);

  // 3+ character results -- filter -> store-match -> relevance/sort, ported
  // from the prototype's `sortedProducts` memo.
  const sortedProducts = useMemo<ProductCardData[]>(() => {
    if (trimmedQuery.length < 3) return [];
    const q = normalizeSearchText(trimmedQuery);
    const textMatched = products.filter(
      (p) => normalizeSearchText(p.name).includes(q) || normalizeSearchText(p.brand).includes(q) || normalizeSearchText(p.category).includes(q)
    );
    const matchedByStore = textMatched.filter((p) => {
      if (selectedStores.includes("all")) return p.currentDeals.length > 0;
      return p.currentDeals.some((d) => matchesAnySelectedStore(d.store, selectedStores));
    });
    const matched = matchedByStore.filter((p) => {
      const hasSpecial = p.currentDeals.some((d) => d.isOnSpecial !== false);
      if (!hasSpecial) return false;
      if (priceFilter === "dodgy" && !p.currentDeals.some((d) => d.dealType === "Dodgy Deal")) return false;
      if (resultsCategoryFilter.length > 0 && !resultsCategoryFilter.includes(groupCategory(p.category))) return false;
      return true;
    });

    const getBestPrice = (p: ProductCardData) => Math.min(...p.currentDeals.map((d) => d.price));
    const getMaxDiscount = (p: ProductCardData) => Math.max(...p.currentDeals.map((d) => d.discountPercentage));
    const getDodgyScore = (p: ProductCardData) =>
      p.currentDeals.some((d) => d.dealType === "Dodgy Deal") ? 2 : p.currentDeals.some((d) => d.dealType === "Fair Price") ? 1 : 0;

    return matched
      .map((product) => ({ product, relevance: getSearchRelevance(product, trimmedQuery) }))
      .sort((a, b) => {
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        if (resultsSortBy === "cheapest") return getBestPrice(a.product) - getBestPrice(b.product);
        if (resultsSortBy === "discount") return getMaxDiscount(b.product) - getMaxDiscount(a.product);
        if (resultsSortBy === "dodgy-rating") return getDodgyScore(b.product) - getDodgyScore(a.product);
        return 0;
      })
      .map((x) => x.product);
  }, [products, trimmedQuery, selectedStores, resultsSortBy, priceFilter, resultsCategoryFilter]);

  const totalRetailersCount = useMemo(
    () => new Set(sortedProducts.flatMap((p) => p.currentDeals.map((d) => d.store))).size,
    [sortedProducts]
  );
  const visibleSearchResults = isSearchResultsExpanded ? sortedProducts : sortedProducts.slice(0, SEARCH_RESULTS_PAGE_SIZE);

  const handleClearText = () => setQuery("");
  const handleBack = () => {
    // Reset to "dodgy" (the new default, see the state declaration above),
    // not "specials" -- keeps the reset value in sync with what the screen
    // opens on.
    setPriceFilter("dodgy");
    closeSearch();
  };

  const getStoreDisplayName = (key: string) => STORE_DISPLAY_FALLBACK[key] || key;

  /** Shared "Categories" button + "Sort" dropdown row, used above both the
   * pre-3-char popular list and the post-3-char results grid -- factored out
   * once both were repositioned to sit directly above their own list
   * (2026-08-09), since they're now structurally identical apart from which
   * state/options they bind to. */
  const renderCategoriesAndSort = (
    categoryFilter: string[],
    onOpenCategorySheet: () => void,
    sortValue: string,
    onSortChange: (value: string) => void,
    sortOptions: { value: string; label: string }[]
  ) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenCategorySheet}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-50"
      >
        <span>{categoryFilter.length === 0 ? "Categories" : `Categories (${categoryFilter.length})`}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <div className="relative inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-600">
        <span>Sort</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          aria-label="Sort"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          // Opacity-only (no x/y), matching Prototype/index.html's own
          // comment on this exact animation: a `transform` on any ancestor
          // of the sticky pill row below breaks `position: sticky` for it in
          // every browser, so this deliberately stays a plain fade.
          // No `max-w-md`/`mx-auto` cap (2026-08-09 fix, per Jay's "full
          // screen search is less width than the viewport" report): `body`
          // in globals.css is itself capped at `max-width: 480px` and
          // centered, but that only constrains normal-flow content --
          // `position: fixed` is positioned against the real browser
          // viewport regardless of `body`'s own box, so a *second*,
          // slightly different cap here (`max-w-md` = 448px) just produced
          // a visibly narrower, off-by-32px column instead of true
          // edge-to-edge full-viewport coverage. Plain `inset-0` with no
          // width cap is simplest and matches "full screen" literally: it
          // fills the entire viewport on any window size, not just up to
          // whatever the app's own mobile-emulation column happens to be.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex flex-col bg-stone-50"
        >
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-4 pb-3 pt-4 shadow-xs">
            <button
              type="button"
              onClick={handleBack}
              id="close-search-btn"
              aria-label="Back"
              className="-ml-2 flex-shrink-0 cursor-pointer rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-1 items-center rounded-full bg-ink-50 py-2 pl-5 pr-2 transition-all focus-within:ring-2 focus-within:ring-ink-200">
              <Search className="mr-3 h-5 w-5 flex-shrink-0 text-stone-400" aria-hidden="true" />
              <input
                id="full-search-input"
                autoFocus
                className="mobile-zoom-safe-input h-10 w-full border-none bg-transparent font-sans text-sm font-medium text-stone-500 placeholder:text-stone-400 focus:outline-none"
                placeholder="Search for supermarket products"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                enterKeyHint="search"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClearText}
                  id="clear-search-btn"
                  title="Clear search"
                  aria-label="Clear search"
                  className="flex-shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest text-ink-600 hover:bg-ink-100 hover:text-ink-800"
                >
                  Clear
                </button>
              )}
              {/* Scan-barcode button, not the prototype's dismiss-keyboard X
                  -- deliberate override per Jay's ask, see this file's doc
                  comment. Same classes as Home's own scan button
                  (page.tsx's `scan-barcode-btn`) for visual consistency. */}
              <button
                type="button"
                onClick={openScanner}
                id="scan-barcode-btn"
                title="Scan a barcode"
                aria-label="Scan a barcode"
                className="ml-2 flex flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-ink-100 bg-white p-2.5 text-ink-600 transition-colors hover:bg-stone-50"
              >
                <ScanBarcode className="h-5 w-5" aria-hidden="true" />
              </button>
            </form>
          </div>

          <div
            ref={scrollContainerRef}
            onScroll={(e) => {
              lastScrollTopRef.current = e.currentTarget.scrollTop;
            }}
            className="flex-1 space-y-6 overflow-y-auto px-5 pb-5"
          >
            <LoadingMascot loading={loading} label="Loading specials…" />
            {error && (
              // `-mx-5` cancels this scroll container's own `px-5` before
              // ErrorState re-applies its own `mx-5` -- same cancel/reapply
              // pattern this file's pill rows already use (see their own
              // comment above) -- so the card sits at the same inset as it
              // does everywhere else ErrorState is used, not double-indented.
              <div className="-mx-5 pt-4">
                <ErrorState message="Couldn't load specials." detail={error} onRetry={retry} />
              </div>
            )}

            {!loading && !error && trimmedQuery.length < 3 && (
              <div className="space-y-8">
                {query.length > 0 && (
                  <div className="space-y-1.5 py-4 text-center">
                    <Image src="/logo.svg" alt="" width={40} height={40} className="mx-auto h-10 w-10 animate-logo-blink" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Keep typing...</p>
                    <p className="text-xs text-stone-400">Enter at least 3 characters to see suggested items</p>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-1 rounded-xl bg-stone-100 p-1">
                  {(
                    [
                      { id: "dodgy", label: "Dodgy" },
                      { id: "specials", label: "All specials" },
                    ] as { id: PopularTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setPopularTab(tab.id);
                        setPopularSortBy(tab.id === "dodgy" ? "recent" : "discount");
                        setIsPopularExpanded(false);
                      }}
                      className={`flex-1 cursor-pointer rounded-lg py-2 text-xs font-bold transition-colors ${
                        popularTab === tab.id ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-700"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* StorePill -- same component as Home's own store row
                    (text-xs, per-store brand color), per Jay's ask.
                    `-mx-5 px-5` cancels this scroll container's own px-5 so
                    the row bleeds to the true viewport edge (scrollable
                    overflow visibly extends off-screen) instead of stopping
                    20px short of it -- same treatment the results section's
                    sticky pill row below already has, and how Home's own
                    row does it (its parent has no horizontal padding at
                    all, so its own px-5 already reaches the edge). */}
                <div className="hide-scrollbar -mx-5 flex flex-nowrap gap-1.5 overflow-x-auto px-5">
                  {storeOptions.map((store) => (
                    <StorePill
                      key={store.id}
                      storeKey={store.id}
                      label={store.label}
                      active={selectedStores.includes(store.id)}
                      onClick={() => handleStoreToggle(store.id)}
                    />
                  ))}
                </div>

                {sortedPopularSpecials.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      {/* Was a static "Dodgy deals now" / "Popular specials
                          now" label -- now shows the live count (matches
                          `sortedPopularSpecials.length`, the same number the
                          "Show all N deals" button below counts), set in
                          `font-display` (the Manrope brand display face used
                          elsewhere for headings, e.g. the "Results for..."
                          heading below, vs. this label's previous default
                          `font-sans`/Geist), and darkened from
                          `text-stone-400` to `text-stone-500` per Jay's ask. */}
                      <h3 className="font-display text-[10px] font-black tracking-widest text-stone-500">
                        {sortedPopularSpecials.length} {popularTab === "dodgy" ? "dodgy specials" : "specials"} found
                      </h3>
                      {renderCategoriesAndSort(
                        popularCategoryFilter,
                        () => setCategorySheetTarget("popular"),
                        popularSortBy,
                        (v) => setPopularSortBy(v as PopularSortBy),
                        popularTab === "dodgy"
                          ? [
                              { value: "recent", label: "Most recent" },
                              { value: "price-desc", label: "Highest price" },
                              { value: "price-asc", label: "Lowest price" },
                            ]
                          : [
                              { value: "discount", label: "Biggest discount" },
                              { value: "dodgy", label: "Dodgy first" },
                            ]
                      )}
                    </div>
                    <div className="space-y-4">
                      {visiblePopularSpecials.map(({ product, bestDeal }) => (
                        <ProductListCard
                          key={product.id}
                          product={product}
                          deal={bestDeal}
                          storeLinePrefix="On special at"
                          alsoSpecialStores={alsoSpecialStoresForPopular(product, bestDeal)}
                          onNavigate={() => pauseForDealNavigation(product.id, bestDeal.store)}
                        />
                      ))}
                    </div>
                    {sortedPopularSpecials.length > popularPageSize && !isPopularExpanded && (
                      <button
                        type="button"
                        onClick={() => setIsPopularExpanded(true)}
                        className="w-full cursor-pointer rounded-xl border border-stone-200 bg-white py-3 text-xs font-black uppercase tracking-widest text-ink-600 transition-colors hover:text-ink-800"
                      >
                        Show all {sortedPopularSpecials.length} deals
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 py-8 text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
                      {popularTab === "dodgy" ? "No dodgy deals found right now" : "No specials found right now"}
                    </p>
                    <p className="text-xs text-stone-400">Try widening the supermarket filter above.</p>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && trimmedQuery.length >= 3 && (
              <>
                <section className="space-y-2 pt-5 text-center">
                  <h2 id="search-title" className="font-display text-xl font-black leading-none tracking-tighter text-stone-900">
                    Results for &lsquo;{trimmedQuery}&rsquo;
                  </h2>
                  <p id="search-subtitle" className="text-xs font-bold tracking-wide text-stone-400">
                    {sortedProducts.length} {sortedProducts.length === 1 ? "item" : "items"} found · {totalRetailersCount}{" "}
                    {totalRetailersCount === 1 ? "retailer" : "retailers"}
                  </p>
                </section>

                {/* One container (not split) so the sticky pill row below
                    keeps docking against this whole results block, not just
                    the short filter row above it -- same reasoning as
                    Prototype/index.html's own comment at this exact spot. */}
                <section className="flex flex-col gap-4">
                  <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
                    {(
                      [
                        { id: "dodgy", label: "Dodgy" },
                        { id: "specials", label: "All specials" },
                      ] as { id: PriceFilter; label: string }[]
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        id={`price-filter-${tab.id}`}
                        aria-pressed={priceFilter === tab.id}
                        onClick={() => setPriceFilter(tab.id)}
                        className={`flex-1 cursor-pointer rounded-lg py-2 text-xs font-bold transition-colors ${
                          priceFilter === tab.id ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-700"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Sticky within this <section> (not the whole scroll
                      container) so it docks directly under the pinned search
                      bar once the tabs above scroll past. Same `StorePill`
                      component as Home's row + the pre-3-char row above
                      (2026-08-09) -- previously its own uppercase/dot-
                      indicator variant, per Jay's ask for one consistent
                      pill look across the whole screen. */}
                  <div className="sticky top-0 z-20 -mx-5 flex flex-nowrap gap-1.5 overflow-x-auto border-b border-stone-200 bg-stone-50 px-5 pb-2 pt-1 hide-scrollbar">
                    {storeOptions.map((store) => (
                      <StorePill
                        key={store.id}
                        storeKey={store.id}
                        label={store.label}
                        active={selectedStores.includes(store.id)}
                        onClick={() => handleStoreToggle(store.id)}
                      />
                    ))}
                  </div>

                  {/* Categories + Sort now sit directly above the results
                      grid (2026-08-09, per Jay's ask to match the home
                      page's own count+Sort placement -- see
                      TrendingSection/MyListSection in page.tsx), not up near
                      the tabs. The prototype's "Filter by Supermarket:"
                      label that used to sit above the pill row is dropped
                      entirely, also per Jay's ask. */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-500">
                      {sortedProducts.length} {sortedProducts.length === 1 ? "item" : "items"}
                    </span>
                    {renderCategoriesAndSort(
                      resultsCategoryFilter,
                      () => setCategorySheetTarget("results"),
                      resultsSortBy,
                      (v) => setResultsSortBy(v as ResultsSortBy),
                      [
                        { value: "cheapest", label: "Cheapest" },
                        { value: "discount", label: "Biggest discount" },
                        { value: "dodgy-rating", label: "Dodgy rating" },
                      ]
                    )}
                  </div>

                  <div className="space-y-4">
                    {sortedProducts.length > 0 ? (
                      visibleSearchResults.map((product) => {
                        const bestDeal = cheapestApplicableDeal(product, selectedStores);
                        return (
                          <ProductListCard
                            key={product.id}
                            product={product}
                            deal={bestDeal}
                            alsoSpecialStores={alsoSpecialStoresForResults(product, bestDeal, selectedStores)}
                            onNavigate={() => pauseForDealNavigation(product.id, bestDeal.store)}
                          />
                        );
                      })
                    ) : (
                      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6 py-12 text-center">
                        <AlertCircle className="mx-auto h-12 w-12 text-stone-300" aria-hidden="true" />
                        <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                          {!selectedStores.includes("all")
                            ? selectedStores.length === 1
                              ? `No ${trimmedQuery || "grocery"} items were found at ${getStoreDisplayName(selectedStores[0])}`
                              : `No ${trimmedQuery || "grocery"} items were found at the selected supermarkets (${selectedStores
                                  .map(getStoreDisplayName)
                                  .join(", ")})`
                            : `No items matching '${trimmedQuery}'`}
                        </p>
                        <p className="text-xs text-stone-400">
                          {!selectedStores.includes("all")
                            ? "Try selecting 'All' or search for another item."
                            : 'Try searching for "milk", "bread" or "eggs"'}
                        </p>
                      </div>
                    )}
                    {sortedProducts.length > SEARCH_RESULTS_PAGE_SIZE && !isSearchResultsExpanded && (
                      <button
                        type="button"
                        onClick={() => setIsSearchResultsExpanded(true)}
                        className="w-full cursor-pointer rounded-xl border border-stone-200 bg-white py-3 text-xs font-black uppercase tracking-widest text-ink-600 transition-colors hover:text-ink-800"
                      >
                        Show all {sortedProducts.length} items
                      </button>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          {categorySheetTarget !== null && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center">
              <div className="absolute inset-0 bg-stone-900/40" onClick={() => setCategorySheetTarget(null)} />
              <div className="relative flex max-h-[70vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl">
                <div className="flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                  <h3 className="font-display text-sm font-black tracking-tight text-stone-900">Categories</h3>
                  <div className="flex items-center gap-1">
                    {activeCategoryFilter.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveCategoryFilter([])}
                        className="cursor-pointer px-2 py-1 text-xs font-bold text-ink-600 hover:text-ink-800 hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCategorySheetTarget(null)}
                      aria-label="Close"
                      className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="space-y-5 overflow-y-auto px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setActiveCategoryFilter([])}
                    className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
                      activeCategoryFilter.length === 0 ? "border-ink-600 bg-ink-600 text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    All categories
                  </button>
                  {CATEGORY_SECTIONS.map((section) => {
                    const sectionCats = section.categories.filter((c) => homeCategories.includes(c));
                    if (!sectionCats.length) return null;
                    return (
                      <div key={section.title} className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-stone-400">{section.title}</h4>
                        <div className="flex flex-wrap gap-2">
                          {sectionCats.map((cat) => {
                            const isSelected = activeCategoryFilter.includes(cat);
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => toggleActiveCategory(cat)}
                                className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-bold transition-colors ${
                                  isSelected ? "border-ink-600 bg-ink-600 text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                                }`}
                              >
                                {cat}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex-shrink-0 border-t border-stone-100 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setCategorySheetTarget(null)}
                    className="w-full cursor-pointer rounded-xl bg-stone-900 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-ink-600"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
