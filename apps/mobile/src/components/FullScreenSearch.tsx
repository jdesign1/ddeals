"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowLeft, Check, ChevronDown, X } from "lucide-react";
import type { ProductCard as ProductCardData, CurrentDeal } from "@dodgey-deals/shared";
import {
  STORE_DISPLAY_FALLBACK,
  matchesAnySelectedStore,
  deriveAvailableStoreKeys,
  groupCategory,
  CATEGORY_SECTIONS,
  productMatchesSearch,
  getProductSearchRelevance,
} from "@dodgey-deals/shared";
import ProductListCard from "@/components/ProductListCard";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import StorePill from "@/components/StorePill";
import { useSearch } from "@/lib/search-context";
import { useInfiniteReveal, INFINITE_REVEAL_MAX_ITEMS } from "@/hooks/useInfiniteReveal";

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
 * close) instead of taking props, matching how `AppHeader`
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
 *  - Search matching now comes from `packages/shared/src/product-search.ts`:
 *    query tokens are matched across brand/name/category, with prefix and
 *    bounded typo tolerance. This fixes metadata-split queries such as
 *    "Anchor Protein" and keeps mobile/browser search behavior in one place.
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
 *  - The full-screen bar had a trailing scan-barcode button (`openScanner`)
 *    from 2026-08-09 to 2026-08-14, a deliberate override of the prototype
 *    (whose own comment reasoned the scan button "only makes sense on the
 *    home bar") -- removed again 2026-08-14, per Jay's "remove the scan
 *    barcode icon from all search bars - we can't do this right now",
 *    same ask/same day as the matching removals in `SearchBar.tsx` and the
 *    deal-assessment page's own search-prompt replica. The bar now ends at
 *    the clear control (when there's a query) same as before that
 *    2026-08-09 addition. `openScanner`/`ScannerModal` are still real,
 *    working code -- this app's search UI just has no trigger left
 *    anywhere that reaches them now. That clear control itself swapped
 *    from a text "Clear" button to a plain X icon later the same day (Jay:
 *    "When typing in the search bar, add an X icon to clear, remove the
 *    words 'clear'") -- same ask, same change, as `SearchBar.tsx`'s own
 *    clear button; `X` was already imported here for the category/sort
 *    sheets' own close buttons, so no new import needed.
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
 *
 * Three more changes 2026-08-20, same session as the `priceFilter`
 * default fix above:
 *  - Active-input row's leading `Search` icon swapped for the `/logo.svg`
 *    mascot mark, per Jay: "In the active search bar state, replace the
 *    search icon with the dodgy man icon" -- see that block's own comment,
 *    just above the input row further down this file.
 *  - `popularTab`/`popularSortBy` now default to "specials"/"discount"
 *    (were "dodgy"/"recent"), and `handleBack` now resets both alongside
 *    `priceFilter` -- per Jay's follow-up: "Full screen search mode should
 *    always default to 'All Specials' not dodgy, and be the same for any
 *    entry point to search." See the `popularTab` state declaration's own
 *    comment for why this was left alone the first time and changed this
 *    time.
 *
 * 2026-08-21: `textMatched`/`getSearchRelevance` (below) are now synonym-
 * aware -- per Jay: "search terms like milk, egg, eggs, dairy, cheese etc
 * actually find popular items of that kind, not just items with the title
 * words." Most of those named terms already worked fine under the plain
 * substring match this file already had; "dairy" specifically didn't (see
 * `packages/shared/src/search-synonyms.ts`'s own doc comment for the full,
 * live-data-checked story -- it was returning dairy-FREE/plant-based
 * products instead of real dairy, the opposite of what was asked for). The
 * actual synonym dictionary and matching rules live in that shared module,
 * not here, so they're reusable and independently testable rather than
 * baked into this component.
 */

interface PopularEntry {
  product: ProductCardData;
  bestDeal: CurrentDeal;
}

type PopularTab = "specials" | "dodgy";
type PopularSortBy = "discount" | "dodgy" | "recent" | "price-desc" | "price-asc";
type PriceFilter = "specials" | "dodgy";
type ResultsSortBy = "cheapest" | "discount" | "dodgy-rating";

// `CATEGORY_SECTIONS` promoted to `@dodgey-deals/shared` (`deal-detail.ts`)
// 2026-08-21 once Home's Trending tab needed the identical section list for
// its own new Categories filter -- see that file's own doc comment on the
// export. Imported above alongside `groupCategory`.

const POPULAR_PAGE_SIZE_SPECIALS = 6;
const POPULAR_PAGE_SIZE_DODGY = 24;
const SEARCH_RESULTS_PAGE_SIZE = 30;

// Scroll-direction toolbar show/hide tuning -- see `isToolbarVisible`'s own
// comment below for what these gate.
const TOOLBAR_SHOW_AT_TOP = 8; // px of scrollTop below which the toolbar always shows
const TOOLBAR_SCROLL_DELTA = 4; // px of scroll movement needed to register a direction
// Must match the `duration-300` Tailwind class on both toolbar wrappers
// below -- used to size the post-toggle scroll-event guard window, see
// `toolbarAnimationGuardRef`'s own comment.
const TOOLBAR_TRANSITION_MS = 300;

// `matchesAnySelectedStore` moved to packages/shared/src/data.ts, 2026-08-21
// (see that file's own doc comment on it) -- this file's own local copy is
// gone, imported from `@dodgey-deals/shared` instead now that Home's own
// store-pill row needed the identical logic and duplicating it a second
// time was the wrong call.
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
    preserveSearchStateOnOpen,
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

  // Toolbar (the tab track + StorePill row above each list) show/hide on
  // scroll (2026-08-17, per Jay: "on scroll up from a long list, display the
  // supermarket pills and the tabs, on downward scroll hide them") -- shown
  // at rest / near the top (`scrollTop <= TOOLBAR_SHOW_AT_TOP`) regardless of
  // direction so the toolbar doesn't flicker away on the tiny overscroll/
  // rubber-band jitter some mobile browsers report right at the top of a
  // list.
  //
  // `toolbarScrollAnchorRef` (peer review catch, 2026-08-17): comparing each
  // `onScroll` event's `scrollTop` only against the *previous* event's
  // `scrollTop` (i.e. reusing `lastScrollTopRef` below, which updates on
  // every single event) means a slow/gentle scroll firing many sub-`
  // TOOLBAR_SCROLL_DELTA`-px events in a row could never accumulate enough
  // delta between any two consecutive events to cross the deadzone, so the
  // toolbar would never hide/show outside of fast flicks. This ref instead
  // holds a fixed "anchor" `scrollTop` that only moves once a direction is
  // actually confirmed (or the list returns to the top) -- so a run of small
  // same-direction events keeps accumulating distance against the same
  // anchor until it crosses the threshold, not resetting every event.
  const toolbarScrollAnchorRef = useRef(0);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);

  // Flicker fix (2026-08-17, Jay: "the tabs and pills are flickering at
  // the cut off point") -- diagnosed as a feedback loop: the toolbar's
  // `grid-template-rows` collapse/expand changes the scroll container's
  // content height *above* the current viewport position (the toolbar sits
  // above whatever the user has scrolled down to), and browsers'
  // scroll-anchoring behaviour (on by default in Chromium/Firefox)
  // automatically adjusts `scrollTop` during that ~300ms transition to
  // keep the currently-visible content from visually jumping -- which
  // itself fires more native `scroll` events. Those synthetic events were
  // being read by the handler below just like real user scrolling: a
  // toolbar-hide shrinks content above the viewport -> anchoring nudges
  // `scrollTop` down to compensate -> read as "scrolled up" -> toolbar
  // shows again -> grows content above the viewport -> anchoring nudges
  // `scrollTop` up -> read as "scrolled down" -> hides again -> repeat,
  // visible as rapid flicker right at the point the threshold was first
  // crossed. `toolbarAnimationGuardRef` mutes the handler below for the
  // duration of our own transition (`TOOLBAR_TRANSITION_MS` + a small
  // buffer) every time it changes `isToolbarVisible`, so the
  // scroll-anchoring events that transition itself provokes can't
  // re-trigger another toggle before the animation has actually settled.
  // A ref, not state, since flipping it must never itself cause a
  // re-render/re-run of anything -- it's read and written entirely inside
  // the `onScroll` handler and a `setTimeout` callback.
  const toolbarAnimationGuardRef = useRef(false);
  const toolbarAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A StorePill click can reflow the filtered list and emit a synthetic
  // scroll event. Keep the toolbar visible through that reflow so selecting a
  // supermarket does not immediately undo the user's scroll-up reveal.
  const toolbarStoreSelectionGuardRef = useRef(false);
  const toolbarStoreSelectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setToolbarVisible = (visible: boolean) => {
    // No-op, guard untouched, if the toolbar is already in the requested
    // state (peer review catch, 2026-08-17) -- without this check, every
    // single `onScroll` event while sitting at/near the top of the list
    // (`scrollTop <= TOOLBAR_SHOW_AT_TOP` calls `setToolbarVisible(true)`
    // unconditionally, every event) kept re-arming a fresh 350ms guard
    // window even though nothing was actually changing/animating -- rapid
    // repeat events (rubber-band/momentum scrolling) could keep the guard
    // continuously re-armed well past its intended window, so a genuine
    // hide-toggle right after could get silently swallowed for up to
    // another 350ms, not because a real transition was in flight but
    // because of this stale re-arming.
    if (visible === isToolbarVisible) return;
    setIsToolbarVisible(visible);
    toolbarAnimationGuardRef.current = true;
    if (toolbarAnimationTimeoutRef.current) clearTimeout(toolbarAnimationTimeoutRef.current);
    toolbarAnimationTimeoutRef.current = setTimeout(() => {
      toolbarAnimationGuardRef.current = false;
    }, TOOLBAR_TRANSITION_MS + 50);
  };
  useEffect(() => {
    return () => {
      if (toolbarAnimationTimeoutRef.current) clearTimeout(toolbarAnimationTimeoutRef.current);
      if (toolbarStoreSelectionTimeoutRef.current) clearTimeout(toolbarStoreSelectionTimeoutRef.current);
    };
  }, []);

  const [selectedStores, setSelectedStores] = useState<string[]>(["all"]);
  const [resultsSortBy, setResultsSortBy] = useState<ResultsSortBy>("cheapest");
  // Was "dodgy" (2026-08-10, per Jay's ask for the full-screen search screen
  // to open on the Dodgy tab) -- changed to "specials" 2026-08-20, per Jay:
  // "When searching for an item, All specials tab should be defaulted, to
  // stop users having zero results if the item isn't dodgy." A typed query
  // is filtered against THIS state (see the `priceFilter === "dodgy" &&
  // !p.currentDeals.some(...)` check further down, the actual results-list
  // filter) -- with "dodgy" as the default, typing the name of a product
  // that's on special but not classified Dodgy produced a correct-looking
  // but empty results list, no visible reason why, since the search input
  // itself gave no indication a filter was silently excluding everything.
  // "specials" shows every on-special match regardless of verdict, so a
  // search only ever comes back empty when there's genuinely no matching
  // product on special, not because of an unrelated tab selection the user
  // never touched. `handleBack`'s reset value below updated to match, same
  // "kept in sync" convention as before.
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("specials");
  const [resultsCategoryFilter, setResultsCategoryFilter] = useState<string[]>([]);

  // `popularTab` (this state's own pre-3-character "Popular"/browse-mode
  // counterpart, above) was DELIBERATELY left on "dodgy" the same day
  // `priceFilter` above changed -- browsing before anyone's typed anything
  // isn't "searching for an item" (Jay's own wording that day), so the
  // zero-results failure mode `priceFilter`'s own change fixed didn't apply
  // here. Changed anyway 2026-08-20 (later same day), per Jay's follow-up:
  // "Full screen search mode should always default to 'All Specials' not
  // dodgy, and be the same for any entry point to search" -- broader than
  // the earlier ask, this explicitly covers BOTH tabs and every way into
  // this screen, not just the post-typing results view. `handleBack` below
  // now resets this alongside `priceFilter` too (previously only reset
  // `priceFilter`, since `popularTab` had no "always defaults to X" promise
  // to keep yet) -- this component doesn't unmount between opens (`isActive`
  // just toggles its visibility, see `search-context.tsx`), so without a
  // matching reset here a manual tab switch from a PREVIOUS visit would
  // still be showing on the NEXT one, which is exactly the "any entry
  // point" consistency this ask is about.
  const [popularTab, setPopularTab] = useState<PopularTab>("specials");
  // "discount" to match the tab-click handler below, which sets this same
  // sort whenever the All-specials tab is selected -- keeps the initial
  // render consistent with what clicking the (now-default) tab would
  // produce (same "kept in sync" reasoning `priceFilter`'s own default
  // change above already established).
  const [popularSortBy, setPopularSortBy] = useState<PopularSortBy>("discount");
  const [popularCategoryFilter, setPopularCategoryFilter] = useState<string[]>([]);

  // Re-apply the browse defaults whenever a fresh full-screen search session
  // opens. A deal-page back navigation deliberately opts out through
  // `preserveSearchStateOnOpen`: the component stays mounted, so the selected
  // tab, filters, and `lastScrollTopRef` are already the saved search state we
  // want to restore rather than fresh-session defaults.
  const [lastSearchOpen, setLastSearchOpen] = useState(isOpen);
  if (isOpen !== lastSearchOpen) {
    setLastSearchOpen(isOpen);
    if (isOpen && !preserveSearchStateOnOpen) {
      setPopularTab("specials");
      setPopularSortBy("discount");
      setPriceFilter("specials");
    }
  }

  const [categorySheetTarget, setCategorySheetTarget] = useState<"popular" | "results" | null>(null);
  const activeCategoryFilter = categorySheetTarget === "results" ? resultsCategoryFilter : popularCategoryFilter;
  const setActiveCategoryFilter = categorySheetTarget === "results" ? setResultsCategoryFilter : setPopularCategoryFilter;
  const toggleActiveCategory = (cat: string) =>
    setActiveCategoryFilter((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));

  // Sort bottom sheet (2026-08-13, per Jay's ask to turn "the sort drop down
  // menu on all pages" -- this file's two native `<select>`-based sort
  // controls, Popular Specials' and Search Results' -- into a bottom sheet,
  // matching the Categories sheet right above this that already replaced the
  // Prototype's plain scrim-less popover). Same `null`-means-closed /
  // string-target-means-open shape as `categorySheetTarget`, but the option
  // list + current value + setter differ per target (Popular's options also
  // depend on `popularTab`, same branching the old inline `sortOptions` arg
  // at each call site used to do), so a single derived config object is
  // computed here instead of threading 3 separate props through
  // `renderCategoriesAndSort` the way the pre-sheet `<select>` version did.
  const [sortSheetTarget, setSortSheetTarget] = useState<"popular" | "results" | null>(null);
  const activeSortConfig =
    sortSheetTarget === "popular"
      ? {
          value: popularSortBy as string,
          onChange: (v: string) => setPopularSortBy(v as PopularSortBy),
          options:
            popularTab === "dodgy"
              ? [
                  { value: "recent", label: "Most recent" },
                  { value: "price-desc", label: "Highest price" },
                  { value: "price-asc", label: "Lowest price" },
                ]
              : [
                  { value: "discount", label: "Biggest discount" },
                  { value: "dodgy", label: "Dodgy first" },
                ],
        }
      : sortSheetTarget === "results"
        ? {
            value: resultsSortBy as string,
            onChange: (v: string) => setResultsSortBy(v as ResultsSortBy),
            options: [
              { value: "cheapest", label: "Cheapest" },
              { value: "discount", label: "Biggest discount" },
              { value: "dodgy-rating", label: "Dodgy rating" },
            ],
          }
        : null;

  const trimmedQuery = query.trim();

  // The old dedicated "reset show-all expansion" effect that used to live
  // here (keyed on this exact same dep list: trimmedQuery, selectedStores,
  // resultsSortBy, priceFilter, resultsCategoryFilter) is gone, 2026-08-21 --
  // this bug is exactly why: it called `setIsSearchResultsExpanded`, a
  // setter removed when useInfiniteReveal.ts replaced that state, and this
  // effect was missed at the time (a case-sensitive grep for leftover
  // `isSearchResultsExpanded` references doesn't match `setIsSearchResults
  // Expanded` -- capital I after "set" -- see project.md's 2026-08-21
  // (cont. 6) entry). Not just deleted-and-left-broken: no replacement
  // needed either, because `useInfiniteReveal`'s own `resetKey:
  // sortedProducts` already resets the reveal whenever the result set
  // changes for any reason -- and `sortedProducts` is itself recomputed
  // from this EXACT same dep list (query/store/sort/price/category), so
  // this effect was fully subsumed, not just broken.

  const availableStoreKeys = useMemo(() => deriveAvailableStoreKeys(products), [products]);
  const storeOptions = useMemo(
    () => [{ id: "all", label: "All" }, ...availableStoreKeys.map((key) => ({ id: key, label: STORE_DISPLAY_FALLBACK[key] || key }))],
    [availableStoreKeys]
  );

  const homeCategories = useMemo(
    () => [...new Set(products.map((p) => groupCategory(p.category)).filter(Boolean))].sort(),
    [products]
  );

  // Per-category dodgy-deal counts (2026-08-12, per Jay's ask to grey out
  // categories with no dodgy results in the sheet below) -- a category
  // "has dodgy results" if at least one product in it currently has a
  // Dodgy Deal that's actually on special and matches the current store
  // filter, the same three conditions `popularSpecials`/`sortedProducts`
  // above already apply when deciding what's actually browsable. Shared
  // across both sheet targets ("popular" and "results") since
  // `selectedStores` is the one piece of state both sections already
  // share -- a category greyed out here is genuinely a dead end for
  // either list, not just one of them.
  const categoryDodgyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      const cat = groupCategory(product.category);
      if (!cat) continue;
      const hasDodgy = product.currentDeals.some(
        (d) => d.dealType === "Dodgy Deal" && d.isOnSpecial !== false && matchesAnySelectedStore(d.store, selectedStores)
      );
      if (hasDodgy) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [products, selectedStores]);

  const handleStoreToggle = (storeId: string) => {
    const currentScrollTop = scrollContainerRef.current?.scrollTop ?? lastScrollTopRef.current;
    toolbarScrollAnchorRef.current = currentScrollTop;
    lastScrollTopRef.current = currentScrollTop;
    toolbarStoreSelectionGuardRef.current = true;
    if (toolbarStoreSelectionTimeoutRef.current) clearTimeout(toolbarStoreSelectionTimeoutRef.current);
    toolbarStoreSelectionTimeoutRef.current = setTimeout(() => {
      toolbarStoreSelectionGuardRef.current = false;
      const latestScrollTop = scrollContainerRef.current?.scrollTop ?? lastScrollTopRef.current;
      toolbarScrollAnchorRef.current = latestScrollTop;
      lastScrollTopRef.current = latestScrollTop;
    }, TOOLBAR_TRANSITION_MS + 50);
    setToolbarVisible(true);

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
  // Infinite-scroll reveal replaced the old "Show all N deals" button,
  // 2026-08-21 -- see useInfiniteReveal.ts's own doc comment. `resetKey:
  // sortedPopularSpecials` restarts the reveal at the top whenever the tab,
  // filters, or sort change (it's already recomputed from all of those).
  const {
    visibleCount: visiblePopularCount,
    sentinelRef: popularSentinelRef,
    isCapped: isPopularCapped,
  } = useInfiniteReveal({
    totalCount: sortedPopularSpecials.length,
    chunkSize: popularPageSize,
    maxItems: INFINITE_REVEAL_MAX_ITEMS,
    resetKey: sortedPopularSpecials,
  });
  const visiblePopularSpecials = sortedPopularSpecials.slice(0, visiblePopularCount);

  // 3+ character results -- tokenized AND search across brand/name/category,
  // followed by store/deal filters and relevance sorting. The matcher lives
  // in shared code so browser and mobile surfaces cannot drift apart.
  const sortedProducts = useMemo<ProductCardData[]>(() => {
    if (trimmedQuery.length < 3) return [];
    const textMatched = products.filter((p) => productMatchesSearch(p, trimmedQuery));
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
      .map((product) => ({
        product,
        relevance: getProductSearchRelevance(product, trimmedQuery),
      }))
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
  // Infinite-scroll reveal replaced the old "Show all N items" button,
  // 2026-08-21 -- see useInfiniteReveal.ts's own doc comment. `resetKey:
  // sortedProducts` restarts the reveal at the top whenever the query,
  // store/category/price filter, or sort changes.
  const {
    visibleCount: visibleSearchResultsCount,
    sentinelRef: searchResultsSentinelRef,
    isCapped: isSearchResultsCapped,
  } = useInfiniteReveal({
    totalCount: sortedProducts.length,
    chunkSize: SEARCH_RESULTS_PAGE_SIZE,
    maxItems: INFINITE_REVEAL_MAX_ITEMS,
    resetKey: sortedProducts,
  });
  const visibleSearchResults = sortedProducts.slice(0, visibleSearchResultsCount);

  const handleClearText = () => setQuery("");
  const handleBack = () => {
    // Reset to "specials" (the default as of 2026-08-20, see the state
    // declaration above), not "dodgy" -- keeps the reset value in sync with
    // what the screen opens on.
    setPriceFilter("specials");
    // `popularTab`/`popularSortBy` reset added 2026-08-20 (later same day),
    // per Jay: "Full screen search mode should always default to 'All
    // Specials' not dodgy, and be the same for any entry point to search"
    // -- see the `popularTab` state declaration's own comment above for why
    // this wasn't here already. Without this, closing search after
    // manually switching to the Dodgy tab would leave the NEXT open on
    // Dodgy too (this component stays mounted between opens, its state
    // doesn't reset itself), which is exactly the inconsistent-entry-point
    // behaviour this ask is about.
    setPopularTab("specials");
    setPopularSortBy("discount");
    closeSearch();
  };

  const getStoreDisplayName = (key: string) => STORE_DISPLAY_FALLBACK[key] || key;

  /** Shared "Categories" button + "Sort" button row, used above both the
   * pre-3-char popular list and the post-3-char results grid -- factored out
   * once both were repositioned to sit directly above their own list
   * (2026-08-09), since they're now structurally identical apart from which
   * state/options they bind to. Sort switched from a native `<select>`
   * (visually hidden, stretched over this same label+chevron pill) to
   * opening the bottom sheet below (2026-08-13, per Jay's ask) -- now just
   * takes an `onOpenSortSheet` callback instead of `sortValue`/`onSortChange`/
   * `sortOptions`, since the sheet itself reads the right value/options via
   * `activeSortConfig` above (keyed off `sortSheetTarget`) once it's open.
   *
   * Both triggers: border -> shadow-sm, 2026-08-21, per Jay: "Update the
   * pills and tabs to have no border lines, and short tight drop shadows
   * instead." Same swap as `app/page.tsx`'s `SortDropdown` trigger. */
  const renderCategoriesAndSort = (
    categoryFilter: string[],
    onOpenCategorySheet: () => void,
    onOpenSortSheet: () => void
  ) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenCategorySheet}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[13px] leading-4 font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
      >
        <span>{categoryFilter.length === 0 ? "Categories" : `Categories (${categoryFilter.length})`}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onOpenSortSheet}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[13px] leading-4 font-bold text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
      >
        <span>Sort</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          // Opacity-only (no x/y), matching Prototype/index.html's own
          // comment on this exact animation: a `transform` on any ancestor
          // of the sticky toolbars below (tab track + StorePill row, see
          // their own doc comments further down) breaks `position: sticky`
          // for them in every browser, so this deliberately stays a plain
          // fade.
          // `max-w-[480px] mx-auto` cap (2026-08-12, per Jay's report that
          // this screen "stretches the entire width of the browser" on
          // desktop, unlike every other screen): `body` in globals.css is
          // capped at `max-width: 480px` and centered, but that only
          // constrains normal-flow content -- `position: fixed` is
          // positioned against the real browser viewport regardless of
          // `body`'s own box, so this overlay needs its own matching cap.
          // The 2026-08-09 fix removed an earlier cap outright because it
          // used `max-w-md` (448px), a different value than body's 480px,
          // which produced a visibly narrower, off-by-32px column instead
          // of lining up with the rest of the app. Using the *same* 480px
          // value here (not a different Tailwind breakpoint) avoids that
          // mismatch: `inset-0` still sets left:0/right:0 against the real
          // viewport (needed for `mx-auto` to center a fixed element at
          // all), `w-full` fills up to the cap, and `max-w-[480px]` stops
          // it there -- so on any window wider than 480px this now matches
          // the same locked mobile column every other screen already has,
          // instead of true edge-to-edge full-viewport coverage.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`fixed inset-0 mx-auto flex w-full max-w-[480px] flex-col bg-stone-50 ${
            categorySheetTarget !== null || sortSheetTarget !== null ? "z-[70]" : "z-50"
          }`}
        >
          {/* `border-b` dropped (2026-08-12, per Jay's ask) -- was
              `border-b border-stone-200`, gave this bar a hard bottom edge
              against the results below it; `shadow-xs` alone still reads as
              a distinct top bar without the line. Re-confirmed still gone
              2026-08-17 (Jay: "remove the bottom border line from the top
              nav bar" on this same full search screen) -- no `border-b` was
              present on this div to remove, this bar has had none since
              2026-08-12; the shadow got the requested upgrade instead, see
              `shadow-xs` -> `shadow-sm` below.

              `shadow-xs` -> `shadow-sm` (2026-08-17, same ask, "add the same
              drop shadow" -- i.e. the tight `shadow-sm` `SearchBar.tsx`'s
              pill and `DealCard.tsx`/`ProductListCard.tsx`'s cards all use,
              see `SearchBar.tsx`'s own doc comment). Applied to this outer
              bar (the back-button + pill row), not the pill itself.

              `shadow-sm` dropped entirely (2026-08-17, later same day, Jay:
              "still has a drop shadow or bottom border, remove it please") --
              the shadow added just above still visibly read as a hard edge
              along this bar's bottom, the exact same thing `border-b` was
              removed for back in 2026-08-12. This bar now has neither: no
              border, no shadow, `backdrop-blur-md` alone (see just below)
              is the only thing separating it from the content scrolling
              underneath.

              `bg-white` swapped for `backdrop-blur-md` (2026-08-14, Jay:
              "add the same blur effect and no background fill for the full
              screen search bar" -- same ask, same day, as `SearchBar.tsx`'s
              own `blurred` variant, and given the same treatment: no
              background-color class at all, just the blur, so this reads
              as one consistent "docked bar" look across both the home
              screen's bar and this overlay's own bar. Worth flagging a
              real structural difference from `SearchBar.tsx`, though: that
              bar is `sticky` *inside* its page's scrolling container, so
              content genuinely scrolls underneath it and the blur has
              something to blur. This bar is a plain `flex-shrink-0` row
              sibling of the results below (see the scrollable `overflow-
              y-auto` div right after this one) -- results scroll *within*
              that sibling, never underneath this bar itself, so there's
              nothing moving behind it for `backdrop-blur-md` to visibly
              act on (same "translucent layer over a static background
              looks flat" issue `BottomNav.tsx`'s own doc comment already
              hit once, see its "I can't see this effect" note). Applied as
              asked rather than restructuring this bar to overlay the
              scroll area (a bigger, unrequested layout change) -- flagged
              here in case the effect reads as invisible in practice and a
              follow-up ask to make it truly overlay scrolling content
              turns out to be what was actually wanted. */}
          <div className="flex flex-shrink-0 items-center gap-2 px-4 pb-3 pt-4 backdrop-blur-md">
            <button
              type="button"
              onClick={handleBack}
              id="close-search-btn"
              aria-label="Back"
              className="-ml-2 flex-shrink-0 cursor-pointer rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            {/* `border border-stone-300 bg-white` (2026-08-12, per Jay's "the
                search bar when active should be a light fill, not grey") --
                was `bg-ink-50` (`#f6f5f3`), a solid tinted fill that read as
                grey against this bar's plain white background. Now matches
                `SearchBar.tsx`'s own docked bar exactly: white fill, a light
                border for definition instead of a colored fill.

                `border-stone-300` -> `border-transparent` + `focus-within:
                ring-2 focus-within:ring-ink-200` -> `focus-within:border-
                stone-900` (2026-08-17, per Jay: "remove the border lines
                around the top nav bar search container" + "when the full
                screen search bar is active or focused, use a black border
                line, 1px") -- this is the exact drift `SearchBar.tsx`'s own
                doc comment flagged on 2026-08-17 ("flagging the drift in
                case matching the pill here to SearchBar.tsx's new
                black-border focus state turns out to be wanted too") --
                it was. Now matches `SearchBar.tsx`'s pill exactly: no resting
                border (`border-transparent`, base `border` utility kept so
                there's a 1px border to recolor on focus, not a ring), a
                solid `border-stone-900` (this app's "black", see
                `SearchBar.tsx`'s own comment on why not raw `border-black`)
                on focus-within instead of a soft brand-tinted glow. */}
            {/* `pr-2` -> `pr-3` on this form + the clear button's icon
                `h-4 w-4` -> `h-5 w-5`, 2026-08-20, per Jay: "The X icon in
                the search bar when typing, should be larger, and not so
                close to the right edge." This is the input that's actually
                on-screen while a user is typing (`SearchBar.tsx`'s own
                docked bar unmounts the instant a query exists -- see that
                file's own doc comment, "Renders null while the full-screen
                overlay is open" -- so THIS bar is the one Jay means by
                "when typing"). Bumped the icon to match `Search`'s own
                `h-5 w-5` a few px to its left, rather than leaving the clear
                `X` visibly smaller than the icon that opens the same row.
                `pr-2` (8px) -> `pr-3` (12px) gives the now-larger icon the
                same clearance off the pill's rounded edge the old, smaller
                icon had -- matches `pl-5` (20px) on the input's own leading
                edge better than the original asymmetric 20px/8px split did.
                Same fix mirrored onto `SearchBar.tsx`'s own idle-state
                clear button below for consistency -- that file's own doc
                comment already documents the two bars as deliberately
                matching pill styling "exactly," and this codebase's
                established precedent (2026-08-20, tab-fill stacking-context
                fix) is to apply the same visual fix to every component that
                shares the pattern, not just the one currently being looked
                at. */}
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-1 items-center rounded-full border border-transparent bg-white py-2 pl-5 pr-3 shadow-sm transition-colors focus-within:border-stone-900">
              {/* Mascot mark replaces lucide's `Search` icon here (2026-08-20,
                  per Jay: "In the active search bar state, replace the search
                  icon with the dodgy man icon") -- same `/logo.svg` mark
                  `AppHeader.tsx`/`AuthSheet.tsx` already use for their own
                  top-left brand mark. Enlarged slightly to 22px while keeping
                  the existing `mr-3` spacing, so the input row's layout stays
                  stable. Scoped to just this bar --
                  this is the one search input that's actually on-screen
                  while typing (see the comment above on why `SearchBar.tsx`'s
                  own docked bar is never "active" at the same time this one
                  is); this was `Search`'s only usage in this file, so it's
                  dropped from the `lucide-react` import above rather than
                  left there unused. */}
              <Image src="/logo.svg" alt="" width={22} height={22} className="mr-3 h-[22px] w-[22px] flex-shrink-0" />
              <input
                id="full-search-input"
                autoFocus
                className="mobile-zoom-safe-input h-10 w-full border-none bg-transparent font-sans text-sm font-medium text-stone-500 placeholder:text-stone-500 focus:outline-none"
                placeholder="Search if today's deals are dodgy"
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
                  className="flex-shrink-0 cursor-pointer rounded-full p-1.5 text-stone-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </form>
          </div>

          <div
            ref={scrollContainerRef}
            onScroll={(e) => {
              const scrollTop = e.currentTarget.scrollTop;
              // Muted while our own collapse/expand transition is still
              // settling -- see `toolbarAnimationGuardRef`'s own comment
              // for why (scroll-anchoring feedback loop). Anchor/last-
              // scroll refs still get updated every event even while
              // muted, so the moment the guard lifts, the next real
              // comparison starts from a fresh baseline instead of a
              // stale pre-transition one.
              if (toolbarAnimationGuardRef.current) {
                toolbarScrollAnchorRef.current = scrollTop;
                lastScrollTopRef.current = scrollTop;
                return;
              }
              if (toolbarStoreSelectionGuardRef.current) {
                toolbarScrollAnchorRef.current = scrollTop;
                lastScrollTopRef.current = scrollTop;
                return;
              }
              if (scrollTop <= TOOLBAR_SHOW_AT_TOP) {
                setToolbarVisible(true);
                toolbarScrollAnchorRef.current = scrollTop;
              } else {
                const delta = scrollTop - toolbarScrollAnchorRef.current;
                if (delta > TOOLBAR_SCROLL_DELTA) {
                  setToolbarVisible(false); // scrolled down past the anchor -- hide
                  toolbarScrollAnchorRef.current = scrollTop;
                } else if (delta < -TOOLBAR_SCROLL_DELTA) {
                  setToolbarVisible(true); // scrolled up past the anchor -- show
                  toolbarScrollAnchorRef.current = scrollTop;
                }
                // else: still within the deadzone of the anchor -- leave the
                // anchor where it is so small same-direction events keep
                // accumulating against it instead of resetting each time.
              }
              lastScrollTopRef.current = scrollTop;
            }}
            className="flex-1 space-y-6 overflow-y-auto px-5 pb-safe-nav"
          >
            <LoadingMascot loading={loading} />
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
              // `space-y-8` -> plain div, spacing moved to explicit
              // `mb-8`/`mt-8` on the individual blocks below (2026-08-17,
              // peer review catch on the toolbar's sticky fix just below):
              // `space-y-8` gives `margin-top` to every non-first child,
              // which would land on the sticky toolbar wrapper itself
              // whenever the "Keep typing..." block above it is showing
              // (`query.length > 0`) but NOT when it isn't (empty query,
              // toolbar is the first child) -- margin on a `position:
              // sticky` element's own box shifts where it docks, so the
              // toolbar would sit flush at the very top of the scroll
              // container in one state (empty query) and offset by 32px in
              // the other (1-2 characters typed), an inconsistency `space-
              // y-8` silently introduced. Explicit margins on each
              // non-sticky sibling instead keep the same visual gaps
              // without ever putting margin on the sticky element itself.
              <div>
                {query.length > 0 && (
                  <div className="mb-8 space-y-1.5 py-4 text-center">
                    <Image src="/logo.svg" alt="" width={40} height={40} className="mx-auto h-10 w-10 animate-logo-blink" />
                    <p className="text-[11px] font-bold tracking-widest text-stone-500">Keep typing...</p>
                    <p className="text-[13px] leading-4 text-stone-500">Enter at least 3 characters to see suggested items</p>
                  </div>
                )}

                {/* Tab track + StorePill row wrapped together and pinned
                    (2026-08-17, per Jay's scroll show/hide ask, see
                    `isToolbarVisible`'s own comment above; corrected same
                    day, Jay: "the pills and categories are not showing
                    sticky at the top of the screen, carefully fix again") --
                    first version of this wrapper only collapsed height, it
                    was never actually `position: sticky`, so re-showing it
                    on scroll-up just re-expanded it back at its own normal
                    place in the document flow -- invisible whenever that
                    flow position had already scrolled above the viewport
                    (i.e. exactly the "long list, scrolled down a while"
                    case Jay described), not pinned to the current top of
                    screen the way a persistent toolbar needs to be. `sticky
                    top-0` now lives on this SAME wrapper, alongside its
                    existing `grid-template-rows` 1fr/0fr collapse -- both on
                    one element is safe (unlike wrapping a sticky child
                    inside a separate collapsing ancestor, which starves it
                    of room to visibly dock, see the results section's own
                    version of this wrapper below for the long-form
                    reasoning): once this box's flow position scrolls above
                    the container's top edge, `sticky` pins its rendered
                    box at `top: 0` for as long as this wrapper's immediate
                    parent (tall -- it also contains the whole
                    popular-specials list) keeps scrolling underneath it,
                    regardless of how deep into that list the user has
                    scrolled; collapsing it to `0fr` while stuck just makes
                    it a zero-height pinned strip, and expanding it back
                    while still stuck grows it back into view at that same
                    pinned position instead of wherever it used to sit in
                    the flow. `-mx-5`/`px-5`/`bg-stone-50` move from the
                    inner StorePill row (their old location) to this outer
                    wrapper -- a sticky/pinned bar needs its own opaque
                    background and full-bleed width, same as the results
                    section's sticky row already has, not just the row
                    inside it. `grid` rather than `AnimatePresence`/`motion`
                    (already imported and used elsewhere in this file)
                    because unmounting this on hide would drop the
                    store-filter row's own internal scroll position each
                    time -- staying mounted at `0fr` avoids that, same "stay
                    mounted, animate a property" approach the file's own
                    header comment already uses for the whole overlay's
                    `isActive`. */}
                <div
                  className={`sticky top-0 z-20 -mx-5 grid overflow-hidden bg-stone-50 px-5 transition-[grid-template-rows,padding-top] duration-300 ease-out ${
                    isToolbarVisible ? "pt-4" : "pt-0"
                  }`}
                  style={{ gridTemplateRows: isToolbarVisible ? "1fr" : "0fr" }}
                >
                  {/* `pt-4` above is on this wrapper (the grid CONTAINER),
                      not the collapsing grid item below -- `grid-template-
                      rows: 0fr` only sizes the grid's ROW track, it has no
                      effect on the container's own padding, so a static
                      `pt-4` here would leave a permanent ~16px gap between
                      the search bar and the results even once fully
                      collapsed (2026-08-17 peer-review-style catch, Jay:
                      "items get cropped a bit lower down" than the search
                      bar). Made conditional and added to the transitioned
                      property list alongside `grid-template-rows` so it
                      animates away in step with the collapse instead of
                      snapping.

                      `pb-2` on the grid ITEM below had the exact same bug,
                      just missed in that first pass (2026-08-19, Jay: "the
                      point at which the tabs are cut/cropped on scroll
                      needs to be moved higher by a fraction", pointing at
                      this element's collapsed-state classes) -- `overflow-
                      hidden` zeroes a grid item's auto min-height, but the
                      item's own `padding-bottom` isn't part of that
                      min-content sizing, so a static `pb-2` kept adding a
                      flat 8px underneath the collapsed (0fr) track no
                      matter what -- exactly the "extra space below the
                      search bar top bar" Jay flagged, and the reason the
                      crop point sat 8px lower than the search bar itself.
                      Made conditional (`pb-2` shown / `pb-0` collapsed) and
                      transitioned on this item directly, same treatment as
                      `pt-4` above. */}
                  <div
                    className={`space-y-4 overflow-hidden transition-[padding-bottom] duration-300 ease-out ${
                      isToolbarVisible ? "pb-2" : "pb-0"
                    }`}
                  >
                    {/* `bg-stone-100` -> `border border-stone-200 bg-white`
                        (2026-08-14, Jay: "make the non active state for tabs
                        white, not grey") -- see `app/page.tsx`'s own Trending/
                        My List tab track for the full reasoning; same pattern,
                        same fix, applied here and to the results section's
                        matching tab track below.

                        Active-tab fill animated 2026-08-20, per Jay: "use the
                        same effect for when switching tabs in all tab
                        components" -- same `BottomNav.tsx`/`app/page.tsx`
                        pop-in (their own doc comments have the full
                        reasoning), applied verbatim here and to the results
                        section's matching tab track below: fill moved off
                        this button's own conditional class into an absolutely
                        positioned `motion.span` (`zIndex: -1`, behind the
                        label), mounted/unmounted via `AnimatePresence` on
                        `popularTab === tab.id`, spring scale-in from 0.5,
                        symmetric exit. Text color stays a plain CSS
                        `transition-colors`, same as those two.

                        BUG FIX 2026-08-20 (cont.), per Jay: "The tabs should
                        animate the black fill into view, currently the
                        selected tab is white, and cant be seen" -- the fill
                        was invisible. Root cause: `relative` alone is
                        `position: relative` + `z-index: auto`, which does
                        NOT establish a stacking context, so the negative-
                        `zIndex` fill escaped to the nearest ancestor that
                        DOES (static wrappers all the way up), painting
                        behind unrelated background instead of behind this
                        button's label. Confirmed empirically with an
                        offline Playwright pixel sample: unfixed markup
                        sampled white at the fill's location, `z-0` added
                        alongside `relative` sampled exactly `bg-stone-900`'s
                        rgb. Fix: add `z-0` so the button establishes its
                        own local stacking context and the fill resolves
                        against it, as intended -- same fix applied to
                        `AuthSheet.tsx`, this file's other tab track below,
                        `BottomNav.tsx`, `app/page.tsx` (see their own doc
                        comments). */}
                    {/* Track border -> shadow-sm, 2026-08-21, per Jay's
                        pills/tabs/sort/category no-border ask -- see
                        `app/page.tsx`'s Home tab track for the full
                        cross-reference. */}
                    <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm">
                      {(
                        [
                          { id: "specials", label: "All specials" },
                          { id: "dodgy", label: "Dodgy" },
                        ] as { id: PopularTab; label: string }[]
                      ).map((tab) => {
                        const isActive = popularTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                              setPopularTab(tab.id);
                              setPopularSortBy(tab.id === "dodgy" ? "recent" : "discount");
                              // No longer resets a local "show all" state here (that state's
                              // gone, see useInfiniteReveal.ts) -- sortedPopularSpecials is
                              // itself recomputed from popularTab/popularSortBy, so
                              // useInfiniteReveal's own `resetKey: sortedPopularSpecials`
                              // already restarts the reveal on this exact tab switch.
                            }}
                            className={`relative z-0 flex-1 cursor-pointer rounded-lg py-2 text-[13px] leading-4 font-bold transition-colors ${
                              isActive ? "text-white" : "text-stone-600 hover:text-stone-900"
                            }`}
                          >
                            <AnimatePresence>
                              {isActive && (
                                <motion.span
                                  className="absolute inset-0 rounded-lg bg-stone-900 shadow-xs"
                                  style={{ zIndex: -1 }}
                                  initial={{ scale: 0.5, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0.5, opacity: 0 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                              )}
                            </AnimatePresence>
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* StorePill -- same component as Home's own store row
                        (text-[13px] leading-4, per-store brand color), per Jay's ask.
                        No longer needs its own `-mx-5 px-5` bleed-to-edge --
                        the wrapper above now owns that (see this block's own
                        comment above for why). */}
                    <div className="hide-scrollbar flex flex-nowrap gap-1.5 overflow-x-auto">
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
                  </div>
                </div>

                {sortedPopularSpecials.length > 0 ? (
                  <div className="mt-8 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      {/* Was a static "Dodgy deals now" / "Popular specials
                          now" label -- now shows the live count (matches
                          `sortedPopularSpecials.length`, the same number the
                          "Show all N deals" button below counts), set in
                          `font-display` (the Manrope brand display face used
                          elsewhere for headings, e.g. the "Results for..."
                          heading below, vs. this label's previous default
                          `font-sans`/Geist -- `font-sans` is Inter as of the
                          2026-08-13 UI tidy-up, see globals.css), and
                          darkened from `text-stone-400` to `text-stone-500`
                          per Jay's ask.

                          `font-display` -> `font-sans` + `text-[11px]` ->
                          `text-[13px] leading-4` + `text-stone-500` -> `text-stone-600`
                          (2026-08-17, per Jay: "should be font Inter and a
                          bit darker grey and larger font") -- `font-sans` is
                          Inter (see globals.css's `@theme inline` block,
                          same rationale the comment above already gives for
                          why `font-sans` reads as Inter app-wide), swapped
                          in place of the Manrope `font-display` face this
                          label used specifically. `text-xs` matches
                          the sibling "N items found" label the results
                          section below already uses at this same spot
                          (`text-[13px] leading-4 font-bold text-stone-500`) rather than a
                          smaller one-off arbitrary bump, so both "found"
                          counts read at the same size. `stone-600` one notch
                          darker than the 500 this label already sat at.

                          `tracking-widest` -> `tracking-normal` (2026-08-17,
                          later same day, Jay: "has too large letter spacing,
                          reduce to normal") -- this label carried over
                          `tracking-widest` from its old all-caps-micro-label
                          styling (the same treatment `text-[10px]` micro-
                          labels use elsewhere in this app, e.g. the
                          Categories sheet's section headers below), but at
                          this label's new larger `text-[13px]` size the
                          extra-wide letter-spacing read as too loose --
                          dropped to Tailwind's `tracking-normal` (the
                          default, `letter-spacing: normal`) rather than a
                          smaller positive tracking value, since Jay asked
                          for "normal" specifically, not just "less wide." */}
                      <h3 className="font-sans text-[13px] leading-4 font-black tracking-normal text-stone-600">
                        {sortedPopularSpecials.length} {popularTab === "dodgy" ? "dodgy specials" : "specials"} found
                      </h3>
                      {renderCategoriesAndSort(
                        popularCategoryFilter,
                        () => setCategorySheetTarget("popular"),
                        () => setSortSheetTarget("popular")
                      )}
                    </div>
                    <div className="space-y-4">
                      {visiblePopularSpecials.map(({ product, bestDeal }) => (
                        <ProductListCard
                          key={product.id}
                          product={product}
                          deal={bestDeal}
                          storeLinePrefix="Special at" // 2026-08-17, Jay: "change wording to just 'special at supermarket', remove the word 'on'"
                          alsoSpecialStores={alsoSpecialStoresForPopular(product, bestDeal)}
                          onNavigate={() => pauseForDealNavigation(product.id, bestDeal.store)}
                        />
                      ))}
                    </div>
                    {/* Sentinel -- see TrendingSection's own copy of this
                        comment (page.tsx) for the full reasoning; same
                        pattern, unmounts once there's nothing left to
                        reveal so the observer naturally stops firing. */}
                    {visiblePopularCount < sortedPopularSpecials.length && !isPopularCapped && (
                      <div ref={popularSentinelRef} aria-hidden="true" className="h-px w-full" />
                    )}
                    {isPopularCapped && (
                      <p className="py-2 text-center text-[13px] leading-4 font-semibold text-stone-500">
                        Showing top {INFINITE_REVEAL_MAX_ITEMS} of {sortedPopularSpecials.length} — narrow with a store or
                        category filter to see more.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-8 space-y-1 py-8 text-center">
                    <p className="text-[13px] leading-4 font-bold tracking-widest text-stone-500">
                      {popularTab === "dodgy" ? "No dodgy deals found right now" : "No specials found right now"}
                    </p>
                    <p className="text-[13px] leading-4 text-stone-500">Try widening the supermarket filter above.</p>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && trimmedQuery.length >= 3 && (
              <>
                <section className="space-y-2 pt-5 text-center">
                  <h2 id="search-title" className="font-display text-lg font-black leading-none tracking-normal text-stone-900">
                    Results for &lsquo;{trimmedQuery}&rsquo;
                  </h2>
                  <p id="search-subtitle" className="text-[13px] leading-4 font-bold tracking-wide text-stone-500">
                    {sortedProducts.length} {sortedProducts.length === 1 ? "item" : "items"} found · {totalRetailersCount}{" "}
                    {totalRetailersCount === 1 ? "retailer" : "retailers"}
                  </p>
                </section>

                {/* One container (not split) so the sticky toolbar below
                    keeps docking against this whole results block, not just
                    a short filter row above it -- same reasoning as
                    Prototype/index.html's own comment at this exact spot. */}
                <section className="flex flex-col gap-4">
                  {/* Tab track + StorePill row pinned together
                      (2026-08-17, per Jay's scroll show/hide ask, corrected
                      same day per his "not showing sticky at the top of the
                      screen, carefully fix again" -- see the pre-3-char
                      toolbar's matching comment above for the full story on
                      why). Originally split into two pieces here -- a
                      plain (non-sticky) collapsing tab track, then a
                      separately `sticky` pill row below it -- reasoning
                      that combining them under one collapsing ancestor
                      would starve the sticky row of room to dock. True as
                      far as it went, but it missed that the tab track
                      itself, never being `sticky`, could only ever
                      reappear at its own place in the document flow on
                      scroll-up -- invisible once that flow position had
                      already scrolled above the viewport, i.e. exactly the
                      "long list, scrolled down a while" case this whole
                      feature is for. Fix: make the WHOLE toolbar (tab track
                      + pill row together) the one sticky, collapsing
                      element, rather than splitting sticky/non-sticky
                      across two children -- `sticky`/`overflow-hidden` on
                      the same node is safe (it's only wrapping a sticky
                      child inside a SEPARATE collapsing ancestor that
                      starves it of room), so there's no conflict putting
                      both concerns on this one wrapper. `bg-stone-100` ->
                      `border border-stone-200 bg-white` on the tab track
                      itself is the same change as the Popular tab track
                      above -- 2026-08-14, Jay: "make the non active state
                      for tabs white, not grey". */}
                  {/* `pt-1` conditional, not static, same fix and same
                      reason as the browse-view toolbar above (2026-08-17,
                      Jay: "items get cropped a bit lower down" than the
                      search bar) -- a static top-padding on this grid
                      CONTAINER survives the `grid-template-rows: 0fr`
                      collapse untouched (that only sizes the row track,
                      not the container's own box model), leaving a
                      permanent gap under the search bar even fully
                      collapsed. */}
                  <div
                    // `border-b` itself also moved fully into the
                    // conditional (peer review catch, 2026-08-17) -- it was
                    // previously present in BOTH branches with only its
                    // color toggling (`border-stone-200` vs `border-
                    // transparent`), which still reserves the border's own
                    // 1px of box height even when "hidden," the same class
                    // of bug `pt-1`/`pt-4` just above had with padding.
                    // Dropped to no border at all when collapsed.
                    className={`sticky top-0 z-20 -mx-5 grid overflow-hidden bg-stone-50 px-5 transition-[grid-template-rows,padding-top] duration-300 ease-out ${
                      isToolbarVisible ? "border-b border-stone-200 pt-1" : "border-none pt-0"
                    }`}
                    style={{ gridTemplateRows: isToolbarVisible ? "1fr" : "0fr" }}
                  >
                    {/* `space-y-4`, matching the pre-3-char toolbar's own
                        gap between its tab track and pill row (peer review
                        catch, 2026-08-17) -- the merge into one wrapper had
                        left this at `space-y-2`, a noticeably tighter gap
                        than the pre-3-char version's `space-y-4` for what's
                        meant to be the same toolbar look in both places.

                        `pb-2` conditional + transitioned, same fix as the
                        browse-view toolbar above and for the same reason
                        (2026-08-19, Jay: "the point at which the tabs are
                        cut/cropped on scroll needs to be moved higher by a
                        fraction" -- a static `pb-2` here survived the
                        `grid-template-rows: 0fr` collapse untouched,
                        leaving a flat 8px gap under the search bar even
                        fully collapsed). */}
                    <div
                      className={`space-y-4 overflow-hidden transition-[padding-bottom] duration-300 ease-out ${
                        isToolbarVisible ? "pb-2" : "pb-0"
                      }`}
                    >
                      {/* Active-tab fill animated 2026-08-20, per Jay: "use
                          the same effect for when switching tabs in all tab
                          components" -- same pop-in as this file's other tab
                          track above / `app/page.tsx` / `BottomNav.tsx` (their
                          own doc comments have the full reasoning), applied
                          verbatim: `motion.span` fill, `AnimatePresence`
                          keyed on `priceFilter === tab.id`, spring scale-in
                          from 0.5, symmetric exit, text color left as a plain
                          CSS transition.

                          BUG FIX 2026-08-20 (cont.), per Jay: "The tabs
                          should animate the black fill into view, currently
                          the selected tab is white, and cant be seen" --
                          same root cause as the tab track above: `relative`
                          alone doesn't establish a stacking context, so the
                          negative-`zIndex` fill escaped past this button to
                          a distant static ancestor and painted invisibly.
                          Confirmed via the same offline Playwright pixel
                          sample as the track above (white -> exact
                          `bg-stone-900` rgb once `z-0` added). Fix: `z-0`
                          alongside `relative`, matching `AuthSheet.tsx`,
                          this file's other track above, `BottomNav.tsx`,
                          `app/page.tsx`. */}
                      {/* Track border -> shadow-sm, 2026-08-21, per Jay's
                          pills/tabs/sort/category no-border ask -- see
                          `app/page.tsx`'s Home tab track for the full
                          cross-reference. */}
                      <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm">
                        {(
                          [
                            { id: "specials", label: "All specials" },
                            { id: "dodgy", label: "Dodgy" },
                          ] as { id: PriceFilter; label: string }[]
                        ).map((tab) => {
                          const isActive = priceFilter === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              id={`price-filter-${tab.id}`}
                              aria-pressed={isActive}
                              onClick={() => setPriceFilter(tab.id)}
                              className={`relative z-0 flex-1 cursor-pointer rounded-lg py-2 text-[13px] leading-4 font-bold transition-colors ${
                                isActive ? "text-white" : "text-stone-600 hover:text-stone-900"
                              }`}
                            >
                              <AnimatePresence>
                                {isActive && (
                                  <motion.span
                                    className="absolute inset-0 rounded-lg bg-stone-900 shadow-xs"
                                    style={{ zIndex: -1 }}
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                  />
                                )}
                              </AnimatePresence>
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Same `StorePill` component as Home's row + the
                          pre-3-char row above (2026-08-09) -- previously
                          its own uppercase/dot-indicator variant, per Jay's
                          ask for one consistent pill look across the whole
                          screen. No longer needs its own `-mx-5 px-5`
                          bleed-to-edge -- the wrapper above now owns that. */}
                      <div className="hide-scrollbar flex flex-nowrap gap-1.5 overflow-x-auto">
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
                    </div>
                  </div>

                  {/* Categories + Sort now sit directly above the results
                      grid (2026-08-09, per Jay's ask to match the home
                      page's own count+Sort placement -- see
                      TrendingSection/MyListSection in page.tsx), not up near
                      the tabs. The prototype's "Filter by Supermarket:"
                      label that used to sit above the pill row is dropped
                      entirely, also per Jay's ask. */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] leading-4 font-bold text-stone-500">
                      {sortedProducts.length} {sortedProducts.length === 1 ? "item" : "items"}
                    </span>
                    {renderCategoriesAndSort(
                      resultsCategoryFilter,
                      () => setCategorySheetTarget("results"),
                      () => setSortSheetTarget("results")
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
                        <p className="text-[13px] leading-4 font-bold tracking-widest text-stone-500">
                          {!selectedStores.includes("all")
                            ? selectedStores.length === 1
                              ? `No ${trimmedQuery || "grocery"} items were found at ${getStoreDisplayName(selectedStores[0])}`
                              : `No ${trimmedQuery || "grocery"} items were found at the selected supermarkets (${selectedStores
                                  .map(getStoreDisplayName)
                                  .join(", ")})`
                            : `No items matching '${trimmedQuery}'`}
                        </p>
                        <p className="text-[13px] leading-4 text-stone-500">
                          {!selectedStores.includes("all")
                            ? "Try selecting 'All' or search for another item."
                            : 'Try searching for "milk", "bread" or "eggs"'}
                        </p>
                      </div>
                    )}
                    {/* Sentinel -- see TrendingSection's own copy of this
                        comment (page.tsx) for the full reasoning. */}
                    {visibleSearchResultsCount < sortedProducts.length && !isSearchResultsCapped && (
                      <div ref={searchResultsSentinelRef} aria-hidden="true" className="h-px w-full" />
                    )}
                    {isSearchResultsCapped && (
                      <p className="py-2 text-center text-[13px] leading-4 font-semibold text-stone-500">
                        Showing top {INFINITE_REVEAL_MAX_ITEMS} of {sortedProducts.length} — narrow your search or filters to
                        see more.
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* Category sheet -- rebuilt 2026-08-12, three of Jay's asks
              together:
               (1) Grey out/disable categories with zero dodgy results
                   right now (`categoryDodgyCounts`, computed above) --
                   `disabled`, no `onClick`, and a distinct grey style so
                   it doesn't read as just another unselected option.
               (2) Full page width, not the old `max-w-md` (448px) --
                   dropped that cap entirely since the scrim wrapper
                   around it already caps at `max-w-[480px]` and this
                   panel is `w-full` inside it, so it now fills exactly
                   as wide as the rest of the app's column.
               (3) Real slide-up/down animation -- this sheet previously
                   had NO enter/exit animation at all (a plain
                   `{condition && (...)}`, popping instantly), unlike
                   every other bottom sheet in this app (`ScannerModal.tsx`,
                   the deal-assessment page's "Cheaper Alternative Options"
                   sheet). Rebuilt on that same established pattern:
                   `AnimatePresence` wrapping a fading scrim + a
                   spring-animated panel sliding in from `y: "100%"`, both
                   independently `fixed` (not nested in a flex `items-end`
                   wrapper the way this used to be) so the panel's own
                   transform animates freely. */}
          <AnimatePresence>
            {categorySheetTarget !== null && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setCategorySheetTarget(null)}
                  className="fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 220 }}
                  className="fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[45vh] max-h-[70vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl"
                >
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                    {/* Bottom-sheet title style unified app-wide 2026-08-19
                        -- was text-sm, now text-lg, same class every bottom
                        sheet's top title uses (see app/page.tsx's Sort sheet
                        for the full cross-reference). */}
                    <h3 className="font-display text-lg font-black tracking-normal text-stone-900">Categories</h3>
                    <div className="flex items-center gap-1">
                      {activeCategoryFilter.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveCategoryFilter([])}
                          className="cursor-pointer px-2 py-1 text-[13px] leading-4 font-bold text-ink-600 hover:text-ink-800 hover:underline"
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
                    {/* Both chip styles below: border -> shadow-sm,
                        2026-08-21, per Jay: "Update the pills and tabs to
                        have no border lines, and short tight drop shadows
                        instead." Applied to this "All categories" chip and
                        every per-category chip in the map below. */}
                    <button
                      type="button"
                      onClick={() => setActiveCategoryFilter([])}
                      className={`cursor-pointer rounded-full px-3 py-2 text-[13px] leading-4 font-bold shadow-sm transition-colors ${
                        activeCategoryFilter.length === 0 ? "bg-ink-600 text-white" : "bg-white text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      All categories
                    </button>
                    {CATEGORY_SECTIONS.map((section) => {
                      const sectionCats = section.categories.filter((c) => homeCategories.includes(c));
                      if (!sectionCats.length) return null;
                      return (
                        <div key={section.title} className="space-y-2">
                          <h4 className="text-[11px] font-black tracking-widest text-stone-500">{section.title}</h4>
                          <div className="flex flex-wrap gap-2">
                            {sectionCats.map((cat) => {
                              const isSelected = activeCategoryFilter.includes(cat);
                              const hasDodgyResults = (categoryDodgyCounts.get(cat) ?? 0) > 0;
                              return (
                                <button
                                  key={cat}
                                  type="button"
                                  disabled={!hasDodgyResults}
                                  aria-disabled={!hasDodgyResults}
                                  title={hasDodgyResults ? undefined : "No dodgy deals in this category right now"}
                                  onClick={() => toggleActiveCategory(cat)}
                                  className={`rounded-full px-3 py-2 text-[13px] leading-4 font-bold shadow-sm transition-colors ${
                                    !hasDodgyResults
                                      ? "cursor-not-allowed bg-stone-50 text-stone-300"
                                      : isSelected
                                        ? "cursor-pointer bg-ink-600 text-white"
                                        : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"
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
                      className="w-full cursor-pointer rounded-xl bg-stone-900 py-3 text-[13px] leading-4 font-black tracking-widest text-white transition-colors hover:bg-ink-600"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Sort bottom sheet (2026-08-13, per Jay's ask) -- same
              scrim + spring slide-up pattern as the Categories sheet right
              above, reading its option list/current value/setter from
              `activeSortConfig` (keyed off `sortSheetTarget`) rather than
              the Categories sheet's own multi-select "toggle a chip" list:
              sort is single-select, so picking a row applies it and closes
              the sheet immediately (matching the native `<select>` this
              replaced -- picking an option there closed the picker too),
              no separate "Done" footer needed. */}
          <AnimatePresence>
            {sortSheetTarget !== null && activeSortConfig && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSortSheetTarget(null)}
                  className="fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 220 }}
                  className="fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[45vh] max-h-[70vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl"
                >
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                    {/* Bottom-sheet title style unified app-wide 2026-08-19
                        -- was text-sm, now text-lg, same class every bottom
                        sheet's top title uses (see app/page.tsx's Sort sheet
                        for the full cross-reference). */}
                    <h3 className="font-display text-lg font-black tracking-normal text-stone-900">Sort by</h3>
                    <button
                      type="button"
                      onClick={() => setSortSheetTarget(null)}
                      aria-label="Close"
                      className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="overflow-y-auto py-2 pb-safe-sm">
                    {activeSortConfig.options.map((opt) => {
                      const isSelected = opt.value === activeSortConfig.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            activeSortConfig.onChange(opt.value);
                            setSortSheetTarget(null);
                          }}
                          className={`flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left text-sm font-bold transition-colors ${
                            isSelected ? "text-ink-600" : "text-stone-700 hover:bg-stone-50"
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
