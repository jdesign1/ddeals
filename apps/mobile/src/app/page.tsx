"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, ScanBarcode, Search } from "lucide-react";
import {
  storeMatchesFilter,
  deriveAvailableStoreKeys,
  STORE_DISPLAY_FALLBACK,
  type ProductCard,
  type CurrentDeal,
} from "@dodgey-deals/shared";
import { fetchUserLists, fetchItemsForLists } from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/search-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import ProductListCard from "@/components/ProductListCard";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import StorePill from "@/components/StorePill";

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
 */

interface FlatDeal {
  product: ProductCard;
  deal: CurrentDeal;
}

type SortBy = "discount" | "dodgy";

/** Ported from Prototype/index.html's `ProductCard` call sites: other
 * stores (besides the one this card is already showing) currently running
 * a real special on the same product, for the "Also on special at:" row. */
function alsoSpecialStores(product: ProductCard, shownStore: string): string[] {
  const seen = new Set<string>();
  for (const deal of product.currentDeals) {
    if (deal.isOnSpecial !== false && deal.store !== shownStore) seen.add(deal.store);
  }
  return [...seen];
}

/** Ported from Prototype/index.html's rail sort control (`railSortBy`
 * discount/dodgy options) — "Dodgy first" is a legitimate no-op on
 * Trending specifically, since that rail is already filtered to confirmed
 * Real Deal entries only (see its own subtitle); it isn't wired to lie
 * about anything, it just has nothing to reorder there. */
function sortDeals(deals: FlatDeal[], sortBy: SortBy): FlatDeal[] {
  const sorted = [...deals];
  if (sortBy === "dodgy") {
    sorted.sort((a, b) => (b.deal.dealType === "Dodgy Deal" ? 1 : 0) - (a.deal.dealType === "Dodgy Deal" ? 1 : 0));
  } else {
    sorted.sort((a, b) => b.deal.discountPercentage - a.deal.discountPercentage);
  }
  return sorted;
}

const TRENDING_PAGE_SIZE = 12;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  // `products`/`loadingProducts`/`error` and the search bar's own
  // query/active state now come from the global `SearchProvider`
  // (lib/search-context.tsx, 2026-08-09) instead of a local fetch + local
  // state -- Home used to run its own `loadLiveProducts` call independent
  // of the (previously Home-only) full-screen overlay; both now share one
  // fetch, and the overlay itself is reachable from any screen, not just
  // this one. Home still owns everything below that's genuinely specific
  // to it (Trending/My List rails, their own sort/expand state).
  const { products, loadingProducts, error, retry: retryProducts, query: searchInput, setQuery: setSearchInput, isActive: isSearchActive, openSearch, openScanner } = useSearch();

  // Computed once via a lazy useState initializer (React's documented escape
  // hatch for a one-time impure call), not inline in useMemo -- calling
  // Date.now() directly in a component/useMemo body trips
  // react-hooks/purity ("Cannot call impure function during render"). The
  // "last 7 days" trending window doesn't need to be live/reactive to the
  // second anyway, so a value fixed for this page's lifetime is correct,
  // not a workaround.
  const [now] = useState(() => Date.now());
  const weekAgo = now - SEVEN_DAYS_MS;

  const [storeFilter, setStoreFilter] = useState("all");
  const [homeTab, setHomeTab] = useState<"trending" | "my-list">("trending");
  const [isTrendingExpanded, setIsTrendingExpanded] = useState(false);
  const [trendingSortBy, setTrendingSortBy] = useState<SortBy>("discount");
  const [myListSortBy, setMyListSortBy] = useState<SortBy>("discount");

  const [myListProductIds, setMyListProductIds] = useState<Set<string> | null>(null);
  // Which user (or null for signed-out) `myListProductIds` was last loaded
  // for -- NOT the same guard as "is myListProductIds non-null", because an
  // account switch (sign out, sign in as someone else) without a full page
  // reload would otherwise leave the *previous* user's product ids sitting
  // in state with nothing to invalidate them. Caught this on review before
  // it shipped: MyListSection happens to gate on `signedIn` first so a
  // signed-out render never leaked the stale data, but a same-session
  // account switch would have shown the wrong user's "on special" items.
  const [myListLoadedForUserId, setMyListLoadedForUserId] = useState<string | null>(null);
  const [myListError, setMyListError] = useState<string | null>(null);

  // Real cross-reference against the caller's own lists, same query S1's
  // list cards run. Egress-conscious on purpose (2026-08-08): only fetches
  // once the My List tab is actually opened, and only once per (tab,
  // user) combination after that -- Home used to fetch this unconditionally
  // on every mount regardless of which tab was showing, which meant a
  // Trending-only visit still pulled the user's lists/items for nothing.
  // Guarded on `myListLoadedForUserId === (user?.id ?? null)` rather than
  // "is myListProductIds non-null" so an account switch invalidates the
  // guard and refetches, instead of showing a stale previous user's data.
  // A plain early return here (the guard-clause branch) never calls
  // setState directly, so it doesn't trip react-hooks/set-state-in-effect
  // -- only the "actually fetch for this user" path runs through the
  // load()/.then() chain, mirroring /lists.
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (homeTab !== "my-list" || myListLoadedForUserId === currentUserId) return;
    let cancelled = false;
    const load = async (): Promise<Set<string> | null> => {
      if (!user) return null;
      const client = getSupabaseClient();
      const lists = await fetchUserLists(client);
      const items = await fetchItemsForLists(client, lists.map((l) => l.id));
      return new Set(items.map((i) => i.product_id));
    };
    load()
      .then((ids) => {
        if (cancelled) return;
        setMyListProductIds(ids);
        setMyListLoadedForUserId(currentUserId);
        setMyListError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setMyListError(err instanceof Error ? err.message : "Failed to load your lists");
      });
    return () => {
      cancelled = true;
    };
  }, [user, homeTab, myListLoadedForUserId]);

  // Derived, not stored state: avoids a separate "start loading" setState in
  // the effect above (which would trip the same lint rule) and can't drift
  // from what the effect is actually doing the way a manually-toggled
  // boolean could. Checked against `myListLoadedForUserId`, not
  // `myListProductIds === null` -- during an account switch, the previous
  // user's non-null `myListProductIds` would otherwise read as "not
  // loading" for a moment while the new fetch is still in flight.
  const myListLoading = !!user && myListLoadedForUserId !== user.id && !myListError;

  // deriveAvailableStoreKeys (packages/shared/src/data.ts) -- extracted this
  // session (2026-08-09, full-screen search build) from this exact inline
  // memo (originally fixed live the same day after Jay reported the
  // Woolworths pill missing -- see that fix's own history in project.md),
  // now shared with /specials and the new full-screen search view instead
  // of each keeping its own copy.
  const availableStoreKeys = useMemo(() => deriveAvailableStoreKeys(products), [products]);

  const trendingDeals = useMemo<FlatDeal[]>(() => {
    const isRecentRealDeal = (d: CurrentDeal) =>
      d.dealType === "Real Deal" &&
      storeMatchesFilter(d.store, storeFilter) &&
      (!d.saleStartedAt || new Date(d.saleStartedAt).getTime() >= weekAgo);

    const all: FlatDeal[] = [];
    for (const product of products) {
      const qualifying = product.currentDeals.filter(isRecentRealDeal);
      if (!qualifying.length) continue;
      const best = qualifying.reduce((a, b) => (b.price < a.price ? b : a));
      all.push({ product, deal: best });
    }
    return all.sort((a, b) => b.deal.discountPercentage - a.deal.discountPercentage);
  }, [products, storeFilter, weekAgo]);

  const myListDeals = useMemo<FlatDeal[]>(() => {
    if (!myListProductIds || !myListProductIds.size) return [];
    const all: FlatDeal[] = [];
    for (const product of products) {
      if (!myListProductIds.has(product.id)) continue;
      const qualifying = product.currentDeals.filter((d) => storeMatchesFilter(d.store, storeFilter));
      if (!qualifying.length) continue;
      const best = qualifying.reduce((a, b) => (b.price < a.price ? b : a));
      all.push({ product, deal: best });
    }
    return all.sort((a, b) => b.deal.discountPercentage - a.deal.discountPercentage);
  }, [products, myListProductIds, storeFilter]);

  return (
    <main className="flex flex-col gap-4 pb-6">
      {/* Ported from Prototype/index.html's SearchTab persistent header +
          `renderSearchBar` (see project.md's "Dodgy Deal · Mobile UI Kit"
          restyle session) -- logo/tagline row + pill search form. Split into
          two blocks (2026-08-09): only the search bar itself docks to the
          top on scroll -- the mascot/tagline row is a normal, non-sticky
          block that scrolls away, per Jay's explicit ask not to have the
          tagline dock alongside the search bar.
          Placeholder copy stays "Search current specials" rather than the
          prototype's "Search for supermarket products" since this search
          only runs over the specials-only dataset loaded here, not the
          prototype's full catalogue -- see this file's doc comment for
          why. */}
      {/* Tagline row and the sticky search bar are two direct <main>
          children (NOT wrapped together) -- a sticky element can only stay
          stuck within the bounds of its own containing block, and a shared
          wrapper here would confine it to that wrapper's own (short)
          height instead of the full page, breaking sticky entirely once
          scrolled past it (caught live in Jay's browser, 2026-08-09).
          `-mt-4` on the search bar cancels out <main>'s own `gap-4` for
          just this one pair, removing the visual gap above the search bar
          without losing gap-4's spacing everywhere else <main> uses it. */}
      {!isSearchActive && (
        <div className="bg-white px-5 pt-2 pb-1.5">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={36} height={36} className="h-9 w-9 flex-shrink-0 animate-logo-blink" />
            <span className="text-sm text-stone-600">Spot if today&rsquo;s deals are dodgy</span>
          </div>
        </div>
      )}
      {!isSearchActive && (
        <div className="sticky top-0 z-20 -mt-4 bg-white px-5 py-2">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex items-center rounded-full border border-stone-300 bg-white py-2.5 pl-5 pr-2 focus-within:ring-2 focus-within:ring-ink-200"
          >
            <Search className="mr-3 h-5 w-5 flex-shrink-0 text-stone-400" aria-hidden="true" />
            <input
              id="search-input"
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                if (value.length > 0) openSearch();
              }}
              onFocus={openSearch}
              placeholder="Search current specials"
              className="mobile-zoom-safe-input h-10 w-full border-none bg-transparent font-sans text-sm font-medium text-stone-500 placeholder:text-stone-400 focus:outline-none"
              enterKeyHint="search"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                id="clear-search-btn"
                title="Clear search"
                aria-label="Clear search"
                type="button"
                className="flex-shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              >
                Clear
              </button>
            )}
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
      )}

      {/* Store filter pills -- ported from Prototype/index.html's global
          supermarket filter. `StorePill` (extracted 2026-08-09) is the same
          component the full-screen search overlay's own store pills now
          use, per Jay's ask for visual parity between the two. */}
      {!isSearchActive && (
        <div className="hide-scrollbar flex flex-nowrap gap-1.5 overflow-x-auto px-5 pb-1">
          <StorePill storeKey="all" label="All" active={storeFilter === "all"} onClick={() => setStoreFilter("all")} />
          {availableStoreKeys.map((key) => (
            <StorePill
              key={key}
              storeKey={key}
              label={STORE_DISPLAY_FALLBACK[key] || key}
              active={storeFilter === key}
              onClick={() => setStoreFilter(key)}
            />
          ))}
        </div>
      )}

      {!isSearchActive && <LoadingMascot loading={loadingProducts} label="Loading specials…" />}
      {!isSearchActive && error && (
        <ErrorState message="Couldn't load today's specials." detail={error} onRetry={retryProducts} />
      )}

      {!isSearchActive && !loadingProducts && !error && (
        <>
          <div className="mx-5 flex items-center gap-1 rounded-xl bg-stone-100 p-1">
            {(["trending", "my-list"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setHomeTab(tab)}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                  homeTab === tab ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {tab === "trending" ? "Trending" : "My List"}
              </button>
            ))}
          </div>

          {homeTab === "trending" && (
            <TrendingSection
              deals={trendingDeals}
              sortBy={trendingSortBy}
              onSortByChange={setTrendingSortBy}
              isExpanded={isTrendingExpanded}
              onExpand={() => setIsTrendingExpanded(true)}
            />
          )}

          {homeTab === "my-list" && (
            <MyListSection
              authLoading={authLoading}
              signedIn={!!user}
              loading={myListLoading}
              error={myListError}
              onRetry={() => {
                // Resets the "already loaded for this user" guard back to
                // its pre-fetch state (`null`, same as before any fetch has
                // ever run for a signed-in user -- see that state's own
                // initializer above) so the load effect's existing
                // `myListLoadedForUserId === currentUserId` check reads as
                // "not loaded yet" and fires again, exactly the normal
                // first-load path, not a special-cased retry branch.
                setMyListLoadedForUserId(null);
                setMyListError(null);
              }}
              deals={myListDeals}
              sortBy={myListSortBy}
              onSortByChange={setMyListSortBy}
            />
          )}
        </>
      )}
    </main>
  );
}

/** Ported from Prototype/index.html's "Sort" control (the pill next to each
 * rail's heading -- a `<select>` visually hidden but stretched over a
 * styled label+chevron, so it keeps native picker behaviour). */
function SortDropdown({ value, onChange }: { value: SortBy; onChange: (value: SortBy) => void }) {
  return (
    <div className="relative inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-600">
      <span>Sort</span>
      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortBy)}
        aria-label="Sort"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="discount">Biggest discount</option>
        <option value="dodgy">Dodgy first</option>
      </select>
    </div>
  );
}

function TrendingSection({
  deals,
  sortBy,
  onSortByChange,
  isExpanded,
  onExpand,
}: {
  deals: FlatDeal[];
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
  isExpanded: boolean;
  onExpand: () => void;
}) {
  const sorted = useMemo(() => sortDeals(deals, sortBy), [deals, sortBy]);
  const visible = isExpanded ? sorted : sorted.slice(0, TRENDING_PAGE_SIZE);

  return (
    <section className="flex flex-col gap-4 px-5">
      <div className="space-y-1 pb-1 text-center">
        <h3 className="font-display text-lg font-black tracking-tight text-stone-900">Trending real savings this week</h3>
        <p className="text-xs font-semibold text-stone-500">Items we&rsquo;ve confirmed are real saver deals.</p>
      </div>
      {deals.length === 0 ? (
        <p className="text-sm text-stone-500">No confirmed real-saver deals started in the last week.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-500">
              {sorted.length} {sorted.length === 1 ? "item" : "items"}
            </span>
            <SortDropdown value={sortBy} onChange={onSortByChange} />
          </div>
          <div className="grid grid-cols-1 gap-4">
            {visible.map(({ product, deal }) => (
              <ProductListCard
                key={`${product.id}-${deal.store}`}
                product={product}
                deal={deal}
                alsoSpecialStores={alsoSpecialStores(product, deal.store)}
              />
            ))}
          </div>
          {sorted.length > TRENDING_PAGE_SIZE && !isExpanded && (
            <button
              type="button"
              onClick={onExpand}
              className="w-full cursor-pointer rounded-xl border border-stone-200 bg-white py-3 text-xs font-black uppercase tracking-widest text-ink-600 transition-colors hover:text-ink-800"
            >
              Show all {sorted.length} deals
            </button>
          )}
        </>
      )}
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
  const sorted = useMemo(() => sortDeals(deals, sortBy), [deals, sortBy]);

  if (authLoading) return <p className="px-5 text-sm text-stone-500">Loading…</p>;

  if (!signedIn) {
    return (
      <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-200 bg-white py-10 text-center">
        <p className="max-w-xs px-4 text-sm font-bold text-stone-700">
          You need to create an account or log in to use My List
        </p>
        <Link
          href="/lists"
          className="rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest text-white"
          style={{ backgroundColor: "var(--color-brand-primary)" }}
        >
          Log in or create an account
        </Link>
      </div>
    );
  }

  if (loading) return <p className="px-5 text-sm text-stone-500">Checking your lists for current specials…</p>;
  if (error) return <ErrorState message="Couldn't check your lists." detail={error} onRetry={onRetry} />;

  return (
    <section className="flex flex-col gap-4 px-5">
      <div className="space-y-1 pb-1 text-center">
        <h3 className="font-display text-lg font-black tracking-tight text-stone-900">Current specials in your lists</h3>
        <p className="text-xs font-semibold text-stone-500">Items from your lists currently on special.</p>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-stone-500">
          Nothing in your lists is currently on special — check{" "}
          <Link href="/lists" className="underline" style={{ color: "var(--color-brand-primary)" }}>
            My Lists
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-500">
              {sorted.length} {sorted.length === 1 ? "item" : "items"}
            </span>
            <SortDropdown value={sortBy} onChange={onSortByChange} />
          </div>
          <div className="grid grid-cols-1 gap-4">
            {sorted.map(({ product, deal }) => (
              <ProductListCard
                key={`${product.id}-${deal.store}`}
                product={product}
                deal={deal}
                storeLinePrefix="On special at"
                alsoSpecialStores={alsoSpecialStores(product, deal.store)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
