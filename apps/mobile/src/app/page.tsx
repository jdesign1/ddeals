"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import {
  loadLiveProducts,
  normalizeStoreKey,
  storeMatchesFilter,
  STORE_DISPLAY_FALLBACK,
  type ProductCard,
  type CurrentDeal,
} from "@dodgey-deals/shared";
import { fetchUserLists, fetchItemsForLists } from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import DealCard from "@/components/DealCard";
import FilterPill from "@/components/FilterPill";

/**
 * Home tab. Ported from Prototype/index.html's `SearchTab` (its
 * non-search-active, "home" render branch — search bar + store chips +
 * Trending/My List rails), which is the real, in-use home screen the
 * prototype's users see. The 12-screen Stitch inventory has NO Home mock
 * (confirmed in project.md), so unlike S1/S8 this isn't a design port —
 * it's a functional port of the prototype's actual behaviour, rebuilt
 * against this app's current specials-only data layer + real Lists.
 *
 * Deliberate differences from the prototype, flagged rather than silently
 * dropped:
 *  - No barcode scanner (no camera integration exists in apps/mobile yet).
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
 *  - "My List" cross-references the caller's real lists (via lists.ts)
 *    against the live specials feed for items currently on special — this
 *    is the same real query S1's list cards use, not a guess.
 *  - No "Related to your lists" third tab (only Trending / My List) — the
 *    prototype's "related" tab needs the same cross-store match-index
 *    reasoning as "on special in your list" but for *any* store carrying
 *    something similar to a listed item, which doesn't exist as a query
 *    against this data layer yet.
 */

interface FlatDeal {
  product: ProductCard;
  deal: CurrentDeal;
}

const STORE_PILL_ORDER = ["newworld", "paknsave", "woolworths", "foursquare", "supervalue"];
const TRENDING_PAGE_SIZE = 12;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();

  // Computed once via a lazy useState initializer (React's documented escape
  // hatch for a one-time impure call), not inline in useMemo -- calling
  // Date.now() directly in a component/useMemo body trips
  // react-hooks/purity ("Cannot call impure function during render"). The
  // "last 7 days" trending window doesn't need to be live/reactive to the
  // second anyway, so a value fixed for this page's lifetime is correct,
  // not a workaround.
  const [now] = useState(() => Date.now());
  const weekAgo = now - SEVEN_DAYS_MS;

  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [homeTab, setHomeTab] = useState<"trending" | "my-list">("trending");

  const [myListProductIds, setMyListProductIds] = useState<Set<string> | null>(null);
  const [myListError, setMyListError] = useState<string | null>(null);

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
  }, []);

  // Real cross-reference against the caller's own lists, same query S1's
  // list cards run. No setState call is ever written directly in the effect
  // body (react-hooks/set-state-in-effect flags that, including a plain
  // early-return branch) -- both the "no user" and "fetch for this user"
  // paths run through the same load()/.then() chain below, mirroring /lists.
  useEffect(() => {
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
        setMyListError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setMyListError(err instanceof Error ? err.message : "Failed to load your lists");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Derived, not stored state: avoids a separate "start loading" setState in
  // the effect above (which would trip the same lint rule) and can't drift
  // from what the effect is actually doing the way a manually-toggled
  // boolean could.
  const myListLoading = !!user && myListProductIds === null && !myListError;

  const availableStoreKeys = useMemo(() => {
    const present = new Set<string>();
    for (const product of products) {
      for (const deal of product.currentDeals) present.add(normalizeStoreKey(deal.store));
    }
    return STORE_PILL_ORDER.filter((key) => present.has(key));
  }, [products]);

  const trimmedQuery = searchInput.trim();
  const isSearching = trimmedQuery.length >= 2;

  const searchResults = useMemo<FlatDeal[]>(() => {
    if (!isSearching) return [];
    const q = trimmedQuery.toLowerCase();
    const all: FlatDeal[] = [];
    for (const product of products) {
      const matchesText =
        product.name.toLowerCase().includes(q) ||
        product.brand.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q);
      if (!matchesText) continue;
      for (const deal of product.currentDeals) {
        if (storeMatchesFilter(deal.store, storeFilter)) all.push({ product, deal });
      }
    }
    return all.sort((a, b) => b.deal.discountPercentage - a.deal.discountPercentage);
  }, [products, isSearching, trimmedQuery, storeFilter]);

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
      <header className="sticky top-0 z-20 flex flex-col gap-2 bg-white px-5 pt-6 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black tracking-tight text-stone-900">Dodgy Deal</span>
          <span className="text-xs text-stone-500">Spot if today&rsquo;s deals are dodgy</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2.5 focus-within:ring-2" style={{ ["--tw-ring-color" as string]: "var(--color-brand-primary)" }}>
          <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search current specials"
            className="w-full bg-transparent text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none"
          />
          {searchInput && (
            <button onClick={() => setSearchInput("")} aria-label="Clear search" className="shrink-0 text-stone-400">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto px-5 pb-1">
        <FilterPill label="All Stores" active={storeFilter === "all"} onClick={() => setStoreFilter("all")} />
        {availableStoreKeys.map((key) => (
          <FilterPill
            key={key}
            label={STORE_DISPLAY_FALLBACK[key] || key}
            active={storeFilter === key}
            onClick={() => setStoreFilter(key)}
          />
        ))}
      </div>

      {loadingProducts && <p className="px-5 text-sm text-stone-500">Loading specials…</p>}
      {error && (
        <p className="px-5 text-sm" style={{ color: "var(--color-brand-error)" }}>
          {error}
        </p>
      )}

      {!loadingProducts && !error && isSearching && (
        <section className="flex flex-col gap-3">
          <p className="px-5 text-xs font-semibold text-stone-500">
            {searchResults.length} result{searchResults.length === 1 ? "" : "s"} for &ldquo;{trimmedQuery}&rdquo;{" "}
            <span className="text-stone-400">(current specials only)</span>
          </p>
          {searchResults.length === 0 ? (
            <p className="px-5 text-sm text-stone-500">No current specials match that search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 px-5">
              {searchResults.map(({ product, deal }) => (
                <DealCard key={`${product.id}-${deal.store}`} product={product} deal={deal} />
              ))}
            </div>
          )}
        </section>
      )}

      {!loadingProducts && !error && !isSearching && (
        <>
          <div className="mx-5 flex items-center gap-1 rounded-xl bg-stone-100 p-1">
            {(["trending", "my-list"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setHomeTab(tab)}
                className="flex-1 rounded-lg py-2 text-xs font-bold transition-colors"
                style={
                  homeTab === tab
                    ? { backgroundColor: "white", color: "#1c1917", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                    : { color: "#78716c" }
                }
              >
                {tab === "trending" ? "Trending" : "My List"}
              </button>
            ))}
          </div>

          {homeTab === "trending" && (
            <TrendingSection deals={trendingDeals.slice(0, TRENDING_PAGE_SIZE)} hasMore={trendingDeals.length > TRENDING_PAGE_SIZE} />
          )}

          {homeTab === "my-list" && (
            <MyListSection
              authLoading={authLoading}
              signedIn={!!user}
              loading={myListLoading}
              error={myListError}
              deals={myListDeals}
            />
          )}
        </>
      )}
    </main>
  );
}

function TrendingSection({ deals, hasMore }: { deals: FlatDeal[]; hasMore: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="px-5 text-center">
        <h2 className="text-lg font-black tracking-tight text-stone-900">Trending real savings this week</h2>
        <p className="text-xs font-semibold text-stone-500">Items we&rsquo;ve confirmed are real saver deals.</p>
      </div>
      {deals.length === 0 ? (
        <p className="px-5 text-sm text-stone-500">No confirmed real-saver deals started in the last week.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-5">
            {deals.map(({ product, deal }) => (
              <DealCard key={`${product.id}-${deal.store}`} product={product} deal={deal} />
            ))}
          </div>
          {hasMore && (
            <Link href="/specials" className="mx-5 text-center text-xs font-semibold underline" style={{ color: "var(--color-brand-primary)" }}>
              View all Specials
            </Link>
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
  deals,
}: {
  authLoading: boolean;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  deals: FlatDeal[];
}) {
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
  if (error) return <p className="px-5 text-sm" style={{ color: "var(--color-brand-error)" }}>{error}</p>;

  return (
    <section className="flex flex-col gap-3">
      <div className="px-5 text-center">
        <h2 className="text-lg font-black tracking-tight text-stone-900">Current specials in your lists</h2>
        <p className="text-xs font-semibold text-stone-500">Tap any item to see it on Specials.</p>
      </div>
      {deals.length === 0 ? (
        <p className="px-5 text-sm text-stone-500">
          Nothing in your lists is currently on special — check{" "}
          <Link href="/lists" className="underline" style={{ color: "var(--color-brand-primary)" }}>
            My Lists
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-5">
          {deals.map(({ product, deal }) => (
            <DealCard key={`${product.id}-${deal.store}`} product={product} deal={deal} />
          ))}
        </div>
      )}
    </section>
  );
}
