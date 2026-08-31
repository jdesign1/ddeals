"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, X } from "lucide-react";
import {
  matchesAnySelectedStore,
  deriveAvailableStoreKeys,
  STORE_DISPLAY_FALLBACK,
  groupCategory,
  CATEGORY_SECTIONS,
  type ProductCard,
  type CurrentDeal,
} from "@dodgey-deals/shared";
import { useSearch } from "@/lib/search-context";
import { useAuth } from "@/lib/auth-context";
import { matchesDealFilter, type DealFilter } from "@/lib/deal-filters";
import ProductListCard from "@/components/ProductListCard";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import StorePill from "@/components/StorePill";
import PageLoader from "@/components/PageLoader";
import { useInfiniteReveal, INFINITE_REVEAL_MAX_ITEMS } from "@/hooks/useInfiniteReveal";
import DealFilterTabs from "@/components/DealFilterTabs";
import DealFilterSummary from "@/components/DealFilterSummary";
import {
  subscribeToCheckDealsHeaderVisibility,
} from "@/lib/scroll-events";
import { CHECK_DEALS_SORT_OPTIONS, type CheckDealsSortBy } from "@/lib/deal-sorting";
import { useCardLayout } from "@/lib/card-layout-context";

/**
 * Home tab. Ported from Prototype/index.html's `SearchTab` (its
 * non-search-active, "home" render branch — search bar + store chips +
 * Trending/My List rails), which is the real, in-use home screen the
 * prototype's users see. The 12-screen Stitch inventory has NO Home mock
 * (confirmed in project.md), so unlike S1/S8 this isn't a design port —
 * it's a functional port of the prototype's actual behaviour, rebuilt
 * against this app's current specials-only data layer + real Lists.
 * Styling/layout of every component below (search bar, store pills, tabs,
 * section headers, sort controls, product cards) is copied class-for-class
 * from the prototype's "Dodgy Deal · Mobile UI Kit" restyle (project.md,
 * 2026-08-04 session) — see ProductListCard.tsx and AppHeader.tsx for the
 * same treatment of the shared card and global nav bar.
 *
 * Deliberate differences from the prototype, flagged rather than silently
 * dropped:
 *  - No branch/store personalisation, no category filter chips, no
 *    guest-vs-account gating nuance beyond "log in to see My List" — the
 *    prototype's version of this screen carries a lot of settings state
 *    (`usePersonalised`, `selectedBranches`, `localStorage`) this app has
 *    no equivalent for yet.
 *  - Search here filters the already-loaded specials dataset (same
 *    specials-only architecture /specials uses) rather than the
 *    prototype's full-catalogue search — this app's data layer stopped
 *    fetching the full catalogue client-side back in the 2026-08-07
 *    "specials-only" rearchitecture, so a true full-catalogue search isn't
 *    available without a bigger, separate change to the data layer.
 *  - The full-screen search overlay itself (2026-08-09,
 *    components/FullScreenSearch.tsx) IS now ported — this file's own doc
 *    comment used to flag it as "a substantially separate screen or two of
 *    its own UI, not just this Home screen's styling" and leave it unbuilt;
 *    that's no longer true, see FullScreenSearch.tsx's own doc comment for
 *    what it covers and what's still simplified within it. As of the same
 *    day's later session, the overlay (and the live `products` fetch that
 *    feeds both it and this page's own Trending/My List rails) is global
 *    state via `lib/search-context.tsx` — mounted once in `layout.tsx`, not
 *    owned by this page — so tapping the search bar/icon from any other
 *    screen opens the same overlay, not just from here.
 *  - "My List" cross-references the caller's real lists (via lists.ts)
 *    against the live specials feed for items currently on special — this
 *    is the same real query S1's list cards use, not a guess.
 *  - No "Related to your lists" third tab (only Trending / My List) — the
 *    prototype's "related" tab needs the same cross-store match-index
 *    reasoning as "on special in your list" but for *any* store carrying
 *    something similar to a listed item, which doesn't exist as a query
 *    against this data layer yet.
 *  - My List's sort control offers the same 2 options as Trending's
 *    (Biggest discount / Dodgy first) rather than the prototype's 4-option
 *    version (which adds "Most recent" and "Price low/high") — "Most
 *    recent" would need a list-item-added timestamp this data layer
 *    doesn't fetch, and a second price-direction option didn't seem worth
 *    the extra control for what's usually a short list. Flagged rather
 *    than faked with a no-op "recent" option.
 *  - The scanner's "Search for This Item" now closes the scanner and opens
 *    the full-screen overlay directly via `useSearch()` (no DOM `.focus()`
 *    hand-off needed once both live in the same global context) — see
 *    `components/GlobalOverlays.tsx` and `ScannerModal.tsx`'s own doc
 *    comment, both updated 2026-08-09 to match.
 *
 * Trending/My List rails' own empty-state messages ("No confirmed
 * real-saver deals started in the last week." / "Nothing in your lists is
 * currently on special...") now render through the new shared
 * `EmptyState.tsx` (2026-08-20, per Jay: "Can we use the white card
 * background around all empty state messages for consistency? And centre
 * the text within the card." — triggered by Jay noticing the Trending
 * rail's own plain-text message while toggling the store filter pills) —
 * see that component's own doc comment for the full "why a shared
 * component, why no `mx-5`" reasoning. Both rails sit inside their own
 * `px-5` `<section>` already, so `EmptyState` is used here with no extra
 * `className` — its card fills that existing padded width rather than
 * adding a second inset on top of it.
 */

interface FlatDeal {
  product: ProductCard;
  deal: CurrentDeal;
}

type DealSortBy = CheckDealsSortBy;
type SortBy = "discount" | "dodgy";

/** Ported from Prototype/index.html's `ProductCard` call sites: other
 * stores (besides the one this card is already showing) currently running
 * a real special on the same product, for the "Also special at:" row (was
 * "Also on special at:" until 2026-08-17, see `ProductListCard.tsx`'s own
 * doc comment). */
function alsoSpecialStores(product: ProductCard, shownStore: string): string[] {
  const seen = new Set<string>();
  for (const deal of product.currentDeals) {
    if (deal.isOnSpecial !== false && deal.store !== shownStore) seen.add(deal.store);
  }
  return [...seen];
}

/** The home deal rail keeps the same lightweight sort controls across all
 * three deal assessment filters. */
function sortDeals(deals: FlatDeal[], sortBy: DealSortBy | SortBy): FlatDeal[] {
  const sorted = [...deals];
  if (sortBy === "price-asc") {
    sorted.sort((a, b) => a.deal.price - b.deal.price);
  } else if (sortBy === "discount" || sortBy === "dodgy") {
    if (sortBy === "dodgy") {
      sorted.sort((a, b) => (b.deal.dealType === "Dodgy Deal" ? 1 : 0) - (a.deal.dealType === "Dodgy Deal" ? 1 : 0));
    } else {
      sorted.sort((a, b) => b.deal.discountPercentage - a.deal.discountPercentage);
    }
  } else {
    // "latest" -- most recently started special first. Deals with no
    // saleStartedAt sort last rather than first.
    sorted.sort((a, b) => {
      const aTime = a.deal.saleStartedAt ? new Date(a.deal.saleStartedAt).getTime() : -Infinity;
      const bTime = b.deal.saleStartedAt ? new Date(b.deal.saleStartedAt).getTime() : -Infinity;
      return bTime - aTime;
    });
  }
  return sorted;
}

const TRENDING_PAGE_SIZE = 12;

export default function HomePage() {
  // `products`/`loadingProducts`/`error` and the search bar's own
  // query/active state now come from the global `SearchProvider`
  // (lib/search-context.tsx, 2026-08-09) instead of a local fetch + local
  // state -- Home used to run its own `loadLiveProducts` call independent
  // of the (previously Home-only) full-screen overlay; both now share one
  // fetch, and the overlay itself is reachable from any screen, not just
  // this one. Home still owns everything below that's genuinely specific
  // to it (Trending/My List rails, their own sort/expand state).
  const {
    products,
    loadingProducts,
    error,
    retry: retryProducts,
    isActive: isSearchActive,
    selectedStores,
    toggleStore,
    dealFilter,
    setDealFilter,
  } = useSearch();
  // `selectedStores` lives in `SearchProvider`, not on either surface, so a
  // supermarket choice carries between Check deals and full-screen search.
  const [dealSortBy, setDealSortBy] = useState<DealSortBy>("latest");
  const [dealCategoryFilter, setDealCategoryFilter] = useState<string[]>([]);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  const [isCheckDealsHeaderHidden, setIsCheckDealsHeaderHidden] = useState(false);

  // The top nav and the tabs/pills are one collapsing stack. The scroll
  // container publishes the header state after the same direction threshold
  // used by the top nav; mirroring that event here keeps the tabs/pills from
  // lagging behind on long lists or during slow iOS scrolling.
  useEffect(() => {
    const unsubscribeHeader = subscribeToCheckDealsHeaderVisibility((hidden) => {
      setIsCheckDealsHeaderHidden(hidden);
      setIsToolbarVisible(!hidden);
    });

    return () => {
      unsubscribeHeader();
    };
  }, []);

  // deriveAvailableStoreKeys (packages/shared/src/data.ts) -- extracted this
  // session (2026-08-09, full-screen search build) from this exact inline
  // memo (originally fixed live the same day after Jay reported the
  // Woolworths pill missing -- see that fix's own history in project.md),
  // now shared with /specials and the new full-screen search view instead
  // of each keeping its own copy.
  const availableStoreKeys = useMemo(() => deriveAvailableStoreKeys(products), [products]);

  // Build one best matching special per product for the selected shared deal
  // tab. Real Deals deliberately includes both Real Deal and Fair Price.
  const dealsAllCategories = useMemo<FlatDeal[]>(() => {
    const all: FlatDeal[] = [];
    for (const product of products) {
      const qualifying = product.currentDeals.filter(
        (deal) => matchesAnySelectedStore(deal.store, selectedStores) && matchesDealFilter(deal, dealFilter)
      );
      if (!qualifying.length) continue;
      const best = qualifying.reduce((a, b) => (b.price < a.price ? b : a));
      all.push({ product, deal: best });
    }
    return all;
  }, [products, selectedStores, dealFilter]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { product } of dealsAllCategories) {
      const cat = groupCategory(product.category);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [dealsAllCategories]);

  const availableCategories = useMemo(
    () => [...new Set(dealsAllCategories.map(({ product }) => groupCategory(product.category)))],
    [dealsAllCategories]
  );

  const filteredDeals = useMemo<FlatDeal[]>(() => {
    if (dealCategoryFilter.length === 0) return dealsAllCategories;
    return dealsAllCategories.filter(({ product }) => dealCategoryFilter.includes(groupCategory(product.category)));
  }, [dealsAllCategories, dealCategoryFilter]);

  const dealFilterTintClass =
    dealFilter === "real" ? "deal-filter-real-surface" : dealFilter === "dodgy" ? "deal-filter-dodgy-surface" : "";

  return (
    <>
      {/* Keep the first Check Deals render behind the same solid full-screen
          mascot cover used during deal navigation. The complete page fades in
          as one surface once the shared catalogue request has resolved, so
          the search bar, store pills, tabs, and cards never appear in stages. */}
      <PageLoader loading={loadingProducts} />
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: loadingProducts ? 0 : 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`flex flex-col gap-[14px] pb-6 transition-[background-color] duration-300 ease-out ${!isSearchActive ? "mt-[14px]" : ""} ${dealFilterTintClass || "bg-stone-100"}`}
      >
      {/* Ported from Prototype/index.html's SearchTab persistent header +
          `renderSearchBar` (see project.md's "Dodgy Deal · Mobile UI Kit"
          restyle session).
          The shared search bar moved to `components/SearchBar.tsx`
          (2026-08-11, per Jay's ask to reuse "the same component" at the top
          of `/lists`, `/history`, `/me` too). On Check Deals it is mounted by
          `ScrollContainer.tsx` beside the global nav so it shares the exact
          scrolling element used by the sticky behavior; this page owns the
          toolbar and results content below it.
          The mascot-logo + "Spot if today's deals are dodgy" tagline row
          that used to sit above this bar was removed 2026-08-12, per Jay's
          ask, now that the mascot logo lives in the global `AppHeader` nav
          bar instead (top-left, every screen) -- see that component's own
          doc comment. */}
      {/* `variant="shadow"` added 2026-08-20, per Jay: "Check deals page -
          remove the stroke border from the normal state search bar." --
          `SearchBar.tsx`'s two variants differ in exactly one thing
          relevant here: the pill's own at-rest border (`border-stone-300`
          for "default", `border-transparent` for "shadow"; both still gain
          `focus-within:border-stone-900` either way, so tapping in still
          shows the same black focus outline as before). `blurred` already
          overrides this component's STICKY WRAPPER background regardless
          of `variant` (see `SearchBar.tsx`'s own ternary), so adding
          `variant="shadow"` here only drops the pill's own grey stroke at
          rest -- it doesn't change Home's already-correct transparent/blur
          wrapper from the 2026-08-14 ask. Reusing "shadow" here rather
          than adding a 3rd variant/new prop just for the border -- no page
          needs the two concerns (wrapper fill vs. pill border) decoupled
          today. */}
      {/* Store filter pills -- ported from Prototype/index.html's global
          supermarket filter. `StorePill` (extracted 2026-08-09) is the same
          component the full-screen search overlay's own store pills now
          use, per Jay's ask for visual parity between the two. Multi-select
          (2026-08-21) brings that parity to BEHAVIOR too, not just look --
          see `selectedStores`'s own doc comment above for the full "why". */}
      {!isSearchActive && !loadingProducts && !error && (
        <div
          className={`check-deals-toolbar sticky z-20 grid overflow-hidden px-5 ${
            dealFilterTintClass || "bg-stone-100"
          } ${isToolbarVisible ? "pt-2" : "pt-0"} ${isToolbarVisible ? "" : "check-deals-toolbar-hidden"} ${
            isCheckDealsHeaderHidden ? "check-deals-toolbar-header-hidden" : ""
          }`}
          style={{
            top: "var(--check-deals-chrome-height, 128px)",
            gridTemplateRows: isToolbarVisible ? "1fr" : "0fr",
          }}
        >
          <div
            className={`check-deals-toolbar-content min-h-0 min-w-0 space-y-2 ${isToolbarVisible ? "pb-2" : "pb-0"}`}
          >
            <DealFilterTabs
              value={dealFilter}
              onChange={setDealFilter}
              backgroundClassName={dealFilterTintClass || "bg-stone-100"}
            />
            <div className="hide-scrollbar -mx-5 flex flex-nowrap gap-1.5 overflow-x-auto px-5">
              <StorePill
                storeKey="all"
                label="All"
                active={selectedStores.includes("all")}
                onClick={() => toggleStore("all")}
                backgroundClassName="bg-white"
              />
              {availableStoreKeys.map((key) => (
                <StorePill
                  key={key}
                  storeKey={key}
                  label={STORE_DISPLAY_FALLBACK[key] || key}
                  active={selectedStores.includes(key)}
                  onClick={() => toggleStore(key)}
                  backgroundClassName="bg-white"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {!isSearchActive && <LoadingMascot loading={loadingProducts} />}
      {!isSearchActive && error && (
        <ErrorState message="Couldn't load today's specials." detail={error} onRetry={retryProducts} />
      )}

      {!isSearchActive && !loadingProducts && !error && (
        <>
          {/* Tab track background changed from `bg-stone-100` (grey) to
              `bg-white` (2026-08-14, Jay: "make the non active state for
              tabs white, not grey") -- this track has no background of its
              own separate from its inactive segments (they're plain,
              unstyled `text-*` buttons with no fill), so the grey Jay was
              pointing at was this container's own fill showing through
              behind them. Same change made to both of `FullScreenSearch.tsx`'s
              own tab tracks (Popular/Results "Dodgy" · "All specials"),
              which use this exact same pattern -- all three read as one
              consistent "tabs" control app-wide, not just this one. Added
              `border border-stone-200` here that the grey version never
              needed -- a plain white track sitting directly on this page's
              own `bg-stone-50` base fill (2026-08-14 session, earlier
              today) read nearly invisible without one; a judgment call,
              worth a visual check.

              Active-tab fill animated 2026-08-20, per Jay: "use the same
              effect for when switching tabs in all tab components" --
              `BottomNav.tsx`'s own selection pop-in (that file's own doc
              comment has the full reasoning) applied here verbatim, same
              approach for the same reason: this track's active fill was a
              plain `bg-stone-900` class flip with no scale value for
              Motion to interpolate, so the fill moved into its own
              `motion.span` (`absolute inset-0`, `zIndex: -1` so it paints
              behind the button's own label text despite being
              `position: absolute`), mounted/unmounted via `AnimatePresence`
              keyed on `homeTab === tab`, `initial={{ scale: 0.5, opacity:
              0 }}` -> `animate={{ scale: 1, opacity: 1 }}` on a spring
              (`stiffness: 500, damping: 30`), symmetric `exit`. Each
              `<button>` picked up `relative` (stacking context for the
              fill) and dropped `bg-stone-900`/`shadow-xs` from its own
              conditional class -- those moved onto the fill span -- but
              kept `text-white` vs. `text-stone-600 hover:text-stone-900`
              as a plain CSS color transition, same reasoning as
              `BottomNav.tsx`: a color interpolation on an element that
              stays mounted the whole time is exactly what CSS transitions
              already handle well, no need to route it through Motion too.

              BUG FIX 2026-08-20 (cont.), per Jay: "The tabs should animate
              the black fill into view, currently the selected tab is
              white, and cant be seen" -- the fill above was invisible.
              Root cause: `relative` alone is `position: relative` +
              `z-index: auto`, which does NOT establish a CSS stacking
              context, so the `zIndex: -1` fill resolved its paint order
              against the nearest ancestor that DOES -- here, since every
              wrapper between this button and the page root is `position:
              static` (no positioning utility applied), that's the
              document's own root stacking context. The fill escaped past
              this track's own opaque `bg-white` wrapper div (`className`
              two lines below) and painted behind it, same failure mode as
              `AuthSheet.tsx`. Confirmed with an offline Playwright pixel
              sample on the equivalent markup: unfixed sampled white,
              `z-0` added alongside `relative` sampled exactly
              `bg-stone-900`'s rgb. Fix: `z-0` on the button, giving it its
              own local stacking context so the fill resolves against it
              instead of escaping -- same fix applied to `AuthSheet.tsx`,
              `FullScreenSearch.tsx` (x2). `BottomNav.tsx`'s matching pill
              was checked too and does NOT exhibit this bug -- its `<span>`
              wrapper has no opaque background between it and `<nav>`
              (itself `position: fixed` + `z-40`, a real stacking context
              close by), so the escaped fill still paints above nav's own
              (translucent) background with nothing opaque in front of it;
              verified with the same pixel-sample method before leaving it
              unchanged. */}
          {/* Border dropped 2026-08-21, per Jay: "Update the pills and tabs
              to have no border lines, and short tight drop shadows instead."
              `shadow-sm` added in its place -- same swap applied to every
              other tab track in this app (`AuthSheet.tsx`,
              `FullScreenSearch.tsx` x2) and to the pill components
              (`FilterPill.tsx`, `StorePill.tsx`), the `Sort` trigger button
              below, and `FullScreenSearch.tsx`'s Categories/Sort triggers +
              category chips -- one consistent "flat, shadow-grounded"
              language app-wide instead of border outlines. */}
          <TrendingSection
            deals={filteredDeals}
            filter={dealFilter}
            sortBy={dealSortBy}
            onSortByChange={setDealSortBy}
            categoryFilter={dealCategoryFilter}
            onCategoryFilterChange={setDealCategoryFilter}
            availableCategories={availableCategories}
            categoryCounts={categoryCounts}
          />
        </>
      )}
      </motion.main>
    </>
  );
}

/** Ported from Prototype/index.html's "Sort" control (originally a
 * `<select>` visually hidden but stretched over a styled label+chevron
 * pill, so it kept native picker behaviour). Switched to a bottom sheet
 * (2026-08-13, per Jay's ask to turn "the sort drop down menu on all pages"
 * into a bottom sheet) -- same scrim + spring slide-up pattern
 * `FullScreenSearch.tsx`'s Categories/Sort sheets use, just self-contained
 * here since both call sites (Trending/My List rails below) share the same
 * 2 fixed options, unlike that file's per-screen option lists. Picking a
 * row applies it and closes immediately (single-select, matching what the
 * native `<select>` this replaced did), no separate "Done" footer. */
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "discount", label: "Biggest discount" },
  { value: "dodgy", label: "Dodgy first" },
];

// Trending-only sort options, added 2026-08-21 -- see `TrendingSortBy`'s own
// comment above for why Trending no longer shares `SORT_OPTIONS`/`SortBy`
// with My List.
const TRENDING_SORT_OPTIONS = CHECK_DEALS_SORT_OPTIONS;

// Made generic over `T extends string` 2026-08-21 so Trending's own
// `TrendingSortBy` options could reuse this same dropdown/bottom-sheet
// instead of a second near-identical component -- `options` is now a prop
// instead of always reading the module-level `SORT_OPTIONS`, everything
// else (including the sheet markup/animation) is unchanged.
function SortDropdown<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="listbox"
        // Border -> shadow-sm, 2026-08-21, per Jay's pills/tabs/sort/category
        // no-border ask -- see the Home tab track's own doc comment just
        // above for the full cross-reference.
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 dd-type-control text-stone-600 shadow-none transition-colors hover:bg-stone-50"
      >
        <span>Sort</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="dd-bottom-sheet fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[45vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                {/* Bottom-sheet title style unified app-wide 2026-08-19, per
                    Jay: "use a slightly bolder larger top title text" for
                    every bottom sheet -- was text-sm/font-black here, now
                    the same text-lg/font-black/tracking-tight every other
                    sheet's title uses too (AuthSheet, ScannerModal, the
                    deal page's alternatives sheet, this file's own two
                    sheets, FullScreenSearch's Categories/Sort sheets,
                    AppHeader's account sheet, AddToListButton's and
                    lists/page.tsx's create-list sheet -- see each file's
                    own title element for the same class). */}
                <h3 className="dd-type-sheet-title text-stone-900">Sort by</h3>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                  className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="py-2 pb-safe-sm">
                {options.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left dd-type-control transition-colors ${
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
    </>
  );
}

function TrendingSection({
  deals,
  filter,
  sortBy,
  onSortByChange,
  categoryFilter,
  onCategoryFilterChange,
  availableCategories,
  categoryCounts,
}: {
  deals: FlatDeal[];
  filter: DealFilter;
  sortBy: DealSortBy;
  onSortByChange: (value: DealSortBy) => void;
  categoryFilter: string[];
  onCategoryFilterChange: (value: string[]) => void;
  availableCategories: string[];
  categoryCounts: Map<string, number>;
}) {
  const { isGridLayout } = useCardLayout();
  const sorted = useMemo(() => sortDeals(deals, sortBy), [deals, sortBy]);
  const sectionCopy =
    filter === "dodgy"
      ? {
          empty: "No Dodgy deals or review signals found right now.",
          categoryEmpty: "No Dodgy deals or review signals in this category right now.",
        }
      : filter === "real"
        ? {
            empty: "No real deals found right now.",
            categoryEmpty: "No real deals in this category right now.",
          }
        : {
            empty: "No deals found right now.",
            categoryEmpty: "No deals in this category right now.",
          };
  // Infinite-scroll reveal replaced the old "Show all N deals" button,
  // 2026-08-21 -- see useInfiniteReveal.ts's own doc comment for why
  // scroll-triggered reveal is free here (the whole `deals` array is
  // already in memory, this is a pure re-slice) and why INFINITE_REVEAL_
  // MAX_ITEMS exists (Home's unfiltered trending pool measured 4,596 real
  // rows live -- rendering all of them at once is a real client perf risk,
  // not an egress one). `resetKey: sorted` restarts the reveal at the top
  // whenever the deal list or sort order actually changes -- this already
  // covers the new category filter too, since `deals` itself changes
  // reference whenever `trendingCategoryFilter` changes (see the
  // `trendingDeals` memo in HomePage), no extra wiring needed here.
  const { visibleCount, sentinelRef, isCapped } = useInfiniteReveal({
    totalCount: sorted.length,
    chunkSize: TRENDING_PAGE_SIZE,
    maxItems: INFINITE_REVEAL_MAX_ITEMS,
    resetKey: sorted,
  });
  const visible = sorted.slice(0, visibleCount);

  // Categories filter sheet, added 2026-08-21 per Jay: "Add the categories
  // sort button (existing from the full search screen) to the trending
  // tab." Local open/close state + toggle helper mirror
  // FullScreenSearch.tsx's own `categorySheetTarget`/`activeCategoryFilter`/
  // `toggleActiveCategory` pattern; the sheet markup below is copied from
  // that file's Categories sheet class-for-class (same bottom-sheet shape
  // every sheet in this app uses), with `categoryDodgyCounts`/"dodgy deals"
  // generalized to this rail's own `categoryCounts`/"trending deals" wording
  // since Trending isn't the dodgy/popular-tab context that copy came from.
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const toggleCategory = (cat: string) => {
    onCategoryFilterChange(
      categoryFilter.includes(cat) ? categoryFilter.filter((c) => c !== cat) : [...categoryFilter, cat]
    );
  };

  return (
    <section className="flex flex-col gap-4 px-5">
      <DealFilterSummary filter={filter} />
      {deals.length === 0 && categoryFilter.length === 0 ? (
        <EmptyState>{sectionCopy.empty}</EmptyState>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="dd-type-meta dd-type-meta-strong text-stone-500">
              {sorted.length} {sorted.length === 1 ? "item" : "items"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCategorySheetOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 dd-type-control text-stone-600 shadow-none transition-colors hover:bg-stone-50"
              >
                <span>{categoryFilter.length === 0 ? "Categories" : `Categories (${categoryFilter.length})`}</span>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <SortDropdown value={sortBy} onChange={onSortByChange} options={TRENDING_SORT_OPTIONS} />
            </div>
          </div>
          {sorted.length === 0 ? (
            <EmptyState>{sectionCopy.categoryEmpty}</EmptyState>
          ) : (
            <>
              <div className={`grid gap-4 ${isGridLayout ? "grid-cols-2" : "grid-cols-1"}`}>
                {visible.map(({ product, deal }) => (
                  <ProductListCard
                    key={`${product.id}-${deal.store}`}
                    product={product}
                    deal={deal}
                    alsoSpecialStores={alsoSpecialStores(product, deal.store)}
                  />
                ))}
              </div>
              {/* Sentinel -- invisible, just gives the IntersectionObserver
                  something to watch. Only rendered while there's actually more
                  to reveal; once `visibleCount` catches up to `sorted.length`
                  (or hits the cap) this unmounts and the observer naturally
                  stops firing, matching the old button's own
                  `sorted.length > TRENDING_PAGE_SIZE` gate. */}
              {visibleCount < sorted.length && !isCapped && (
                <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
              )}
              {isCapped && (
                <p className="py-2 text-center dd-type-secondary text-stone-500">
                  Showing top {INFINITE_REVEAL_MAX_ITEMS} of {sorted.length} — narrow with a store filter or search to see more.
                </p>
              )}
            </>
          )}
        </>
      )}
      <AnimatePresence>
        {isCategorySheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategorySheetOpen(false)}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="dd-bottom-sheet fixed inset-x-0 bottom-0 z-[61] mx-auto flex min-h-[45vh] max-h-[70vh] w-full max-w-[480px] flex-col rounded-t-3xl bg-white shadow-2xl"
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
                <h3 className="dd-type-sheet-title text-stone-900">Categories</h3>
                <div className="flex items-center gap-1">
                  {categoryFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onCategoryFilterChange([])}
                      className="cursor-pointer px-2 py-1 dd-type-control text-ink-600 hover:text-ink-800 hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCategorySheetOpen(false)}
                    aria-label="Close"
                    className="cursor-pointer rounded-full p-1.5 text-stone-500 hover:bg-stone-100"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="space-y-6 overflow-y-auto px-5 py-4">
                <button
                  type="button"
                  onClick={() => onCategoryFilterChange([])}
                  className={`cursor-pointer rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${
                    categoryFilter.length === 0 ? "bg-ink-600 text-white" : "bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  All categories
                </button>
                {CATEGORY_SECTIONS.map((section) => {
                  const sectionCats = section.categories.filter((c) => availableCategories.includes(c));
                  if (!sectionCats.length) return null;
                  return (
                    <div key={section.title} className="space-y-2">
                      <h4 className="dd-type-meta dd-type-meta-strong text-stone-500">{section.title}</h4>
                      <div className="flex flex-wrap gap-2">
                        {sectionCats.map((cat) => {
                          const isSelected = categoryFilter.includes(cat);
                          const hasDealResults = (categoryCounts.get(cat) ?? 0) > 0;
                          return (
                            <button
                              key={cat}
                              type="button"
                              disabled={!hasDealResults}
                              aria-disabled={!hasDealResults}
                              title={hasDealResults ? undefined : sectionCopy.categoryEmpty}
                              onClick={() => toggleCategory(cat)}
                              className={`rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${
                                !hasDealResults
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
                  onClick={() => setIsCategorySheetOpen(false)}
                  className="w-full cursor-pointer rounded-xl bg-stone-900 py-3 dd-type-control text-white transition-colors hover:bg-ink-600"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}

function MyListSection({
  authLoading,
  signedIn,
  loading,
  error,
  onRetry,
  deals,
  sortBy,
  onSortByChange,
}: {
  authLoading: boolean;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  deals: FlatDeal[];
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
}) {
  const { isGridLayout } = useCardLayout();
  const sorted = useMemo(() => sortDeals(deals, sortBy), [deals, sortBy]);
  const { openAuthSheet } = useAuth();

  if (authLoading) return <LoadingMascot loading />;

  if (!signedIn) {
    return (
      <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
        <Image
          src="/lists-login.webp"
          alt="A checked shopping list"
          width={482}
          height={512}
          sizes="144px"
          preload
          className="mascot-wave h-auto w-full max-w-[9rem]"
        />
        {/* `max-w-xs` (320px) dropped and `px-4` (16px) -> `px-5` (20px),
            2026-08-21, per Jay's ask on this exact copy: "Increase the
            width of the copy text box, maybe we can fit it all on one
            line (allow 20px padding left and right)." `max-w-xs` was the
            reason this line wrapped at all -- it capped the text well
            inside this card's own available width (the card itself is
            only bounded by the page's `mx-5` margins); removing it lets
            the paragraph use that full width instead, minus the 20px of
            padding on each side Jay asked for specifically, rather than
            an arbitrary new max-width guess. */}
        <p className="px-5 text-sm font-bold text-stone-700">
          You need to create an account or log in to use My List
        </p>
        {/* Brand Guide v1.0 "06 — UI KIT / BUTTONS" primary pill
            (2026-08-13 UI tidy-up). Opens the auth sheet directly now
            (2026-08-20, per Jay: "The my list tab's (not logged in) login
            create account button links to my list - it should just
            trigger the login/account bottom sheet") -- was a `<Link
            href="/lists">`, which navigated away from Home to the Lists
            page (itself just showing the SAME "log in or create an
            account" prompt over again, now via its own `openAuthSheet`
            call, see lists/page.tsx) rather than opening the sheet in
            place. `openAuthSheet` comes straight from `useAuth()`, same
            source every other "Log in" entry point in this app already
            uses (`lists/page.tsx`, `AddToListButton.tsx`, `/me`,
            `/history`, `/account`).

            Label "Log in or create an account" -> "Log in or create
            account" (dropped "an"), 2026-08-21, per Jay: "Update the
            button to say 'Log in or create account'." Scoped to just this
            button's own copy -- the near-identical prompt paragraph above
            it, and the matching buttons on `/lists` and `/history` (still
            "...an account"), weren't named in this ask and are left as
            they were; flagged rather than silently made consistent, since
            "an account" vs "account" reads as a real wording choice, not
            an obvious typo to fix everywhere on sight. */}
        <button
          type="button"
          onClick={() => openAuthSheet("Log in to see specials in your lists.")}
          className="dd-btn dd-btn-primary cursor-pointer"
        >
          Log in or create account
        </button>
      </div>
    );
  }

  if (loading) return <LoadingMascot loading />;
  if (error) return <ErrorState message="Couldn't check your lists." detail={error} onRetry={onRetry} />;

  return (
    <section className="flex flex-col gap-4 px-5">
      {sorted.length > 0 && (
        <div className="space-y-1 pb-1 text-center">
          <h3 className="dd-type-section text-stone-900">Current specials in your lists</h3>
          <p className="dd-type-secondary text-stone-500">Items from your lists currently on special.</p>
        </div>
      )}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white px-4 py-10 text-center">
          <p className="max-w-xs text-sm text-stone-500">Nothing in your lists is currently on special.</p>
          <Link href="/lists" className="dd-btn dd-btn-primary cursor-pointer">
            Check My Lists
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="dd-type-meta dd-type-meta-strong text-stone-500">
              {sorted.length} {sorted.length === 1 ? "item" : "items"}
            </span>
            <SortDropdown value={sortBy} onChange={onSortByChange} options={SORT_OPTIONS} />
          </div>
          <div className={`grid gap-4 ${isGridLayout ? "grid-cols-2" : "grid-cols-1"}`}>
            {sorted.map(({ product, deal }) => (
              <ProductListCard
                key={`${product.id}-${deal.store}`}
                product={product}
                deal={deal}
                storeLinePrefix="Special at" // 2026-08-17, Jay: "change wording to just 'special at supermarket', remove the word 'on'"
                alsoSpecialStores={alsoSpecialStores(product, deal.store)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
