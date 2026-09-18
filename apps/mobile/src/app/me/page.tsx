"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  fetchDealCheckHistory,
  computeDealStats,
  buildPriceChangeStats,
  describeFetchError,
  matchesAnySelectedStore,
  STORE_DISPLAY_FALLBACK,
  type CurrentDeal,
  type DealCheckRow,
  type DealStats,
  type ProductCard,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { requireAccountsSupabaseClient } from "@/lib/accounts-supabase-client";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import { matchesDealFilter, type DealFilter } from "@/lib/deal-filters";
import { useSearch } from "@/lib/search-context";
import MascotImage from "@/components/MascotImage";

const STATS_STORES = Object.entries(STORE_DISPLAY_FALLBACK)
  .filter(([key]) => key !== "supervalue")
  .map(([key, label]) => ({ key, label }));

const MONTH_COUNT = 3;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface CurrentStoreStats {
  key: string;
  store: string;
  real: number;
  dodgy: number;
}

interface MonthlyStoreStats extends CurrentStoreStats {
  realProductIds: Set<string>;
  dodgyProductIds: Set<string>;
}

interface MonthlyStats {
  key: string;
  label: string;
  stores: MonthlyStoreStats[];
}

interface StoreRanking {
  key: string;
  store: string;
  realDeals: number;
  averageDiscount: number;
  totalSavings: number;
}

function dealTimestamp(deal: CurrentDeal): number {
  const saleStartedAt = Date.parse(deal.saleStartedAt ?? "");
  if (Number.isFinite(saleStartedAt)) return saleStartedAt;
  const scrapedAt = Date.parse(deal.scrapedAt ?? "");
  return Number.isFinite(scrapedAt) ? scrapedAt : -Infinity;
}

function bestCurrentDeal(
  product: ProductCard,
  storeKey: string,
  filter: DealFilter,
  sinceTimestamp?: number
): CurrentDeal | undefined {
  return product.currentDeals
    .filter(
      (deal) =>
        matchesAnySelectedStore(deal.store, [storeKey]) &&
        matchesDealFilter(deal, filter) &&
        (sinceTimestamp === undefined || dealTimestamp(deal) >= sinceTimestamp)
    )
    .reduce<CurrentDeal | undefined>((best, deal) => (!best || deal.price < best.price ? deal : best), undefined);
}

function buildCurrentStoreStats(products: ProductCard[]): CurrentStoreStats[] {
  const sinceTimestamp = Date.now() - NINETY_DAYS_MS;
  return STATS_STORES.map(({ key, label }) => {
    const realProducts = new Set<string>();
    const dodgyProducts = new Set<string>();

    for (const product of products) {
      if (bestCurrentDeal(product, key, "real", sinceTimestamp)) realProducts.add(product.id);
      if (bestCurrentDeal(product, key, "dodgy", sinceTimestamp)) dodgyProducts.add(product.id);
    }

    return { key, store: label, real: realProducts.size, dodgy: dodgyProducts.size };
  });
}

function buildStoreRankings(products: ProductCard[]): StoreRanking[] {
  const sinceTimestamp = Date.now() - NINETY_DAYS_MS;
  return STATS_STORES.map(({ key, label }) => {
    const deals = products
      .map((product) => bestCurrentDeal(product, key, "real", sinceTimestamp))
      .filter((deal): deal is CurrentDeal => Boolean(deal));
    const discounts = deals.filter((deal) => Number.isFinite(deal.discountPercentage));
    const averageDiscount = discounts.length
      ? discounts.reduce((sum, deal) => sum + deal.discountPercentage, 0) / discounts.length
      : 0;
    const totalSavings = deals.reduce((sum, deal) => sum + Math.max(0, deal.originalPrice - deal.price), 0);

    return {
      key,
      store: label,
      realDeals: deals.length,
      averageDiscount,
      totalSavings,
    };
  }).sort((a, b) => b.averageDiscount - a.averageDiscount || b.realDeals - a.realDeals);
}

function recentMonthKeys(): { key: string; label: string }[] {
  const current = new Date();
  current.setDate(1);
  current.setHours(0, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-NZ", { month: "short", year: "numeric" });

  return Array.from({ length: MONTH_COUNT }, (_, index) => {
    const date = new Date(current);
    date.setMonth(current.getMonth() - index);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: formatter.format(date),
    };
  });
}

function buildMonthlyStats(products: ProductCard[]): MonthlyStats[] {
  const months = recentMonthKeys();
  const byMonth = new Map<string, MonthlyStoreStats[]>();
  const sinceTimestamp = Date.now() - NINETY_DAYS_MS;

  for (const month of months) {
    byMonth.set(
      month.key,
      STATS_STORES.map(({ key, label }) => ({
        key,
        store: label,
        real: 0,
        dodgy: 0,
        realProductIds: new Set<string>(),
        dodgyProductIds: new Set<string>(),
      }))
    );
  }

  for (const product of products) {
    for (const deal of product.currentDeals) {
      if (!deal.isOnSpecial) continue;
      const timestamp = dealTimestamp(deal);
      if (timestamp < sinceTimestamp) continue;
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) continue;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const store = byMonth.get(monthKey)?.find((item) => matchesAnySelectedStore(deal.store, [item.key]));
      if (!store) continue;
      if (matchesDealFilter(deal, "dodgy")) store.dodgyProductIds.add(product.id);
      if (matchesDealFilter(deal, "real")) store.realProductIds.add(product.id);
    }
  }

  return months.map((month) => ({
    ...month,
    stores: (byMonth.get(month.key) ?? []).map((store) => ({
      ...store,
      real: store.realProductIds.size,
      dodgy: store.dodgyProductIds.size,
    })),
  }));
}

/**
 * Me / Deal Stats — ported from Prototype/index.html's `ProfileTab`
 * (2026-08-11, per Jay's ask to port both "All Checks" and "Deal Stats").
 * Replaces the S9 placeholder this route always was ("Me: Profile &
 * Savings Hub" per project.md's Stitch screen inventory — Deal Stats is
 * exactly the "savings hub" content that placeholder was reserved for, per
 * Jay's own call on where these two ported screens should live: Deal Stats
 * becomes this real page, "All Checks" gets its own route (`/history`)
 * linked from here rather than a 5th bottom-nav tab).
 *
 * Real data throughout, backed by `deal_checks` (see
 * `packages/shared/src/deal-checks.ts`'s own header comment for why that
 * table exists and what it does and doesn't track) — no fabricated
 * numbers. Two real, deliberate differences from the prototype's own
 * `ProfileTab`, both flagged rather than silently changed:
 *  - The prototype's first stat is labelled "Items Added to Lists" but
 *    actually reads `stats.totalChecked` (a checked-deals count, not a
 *    lists count — a pre-existing label/value mismatch in the prototype
 *    itself, not something this port needs to carry over). Relabelled
 *    "Deals Checked" here to match what the number actually is.
 *  - "Estimated Savings"' explanation text describes a DIFFERENT
 *    calculation than the prototype's own copy claims — see
 *    `computeDealStats`'s own doc comment in deal-checks.ts for exactly
 *    why (this table only ever snapshots the one store/price actually
 *    checked, not every store's price at that moment, so the prototype's
 *    "highest minus lowest price found" isn't reproducible here).
 *
 * The 2 plain "Me" `<h1>`s (loading state, signed-out state) are gone as
 * of 2026-08-13, per Jay's "remove the h1 titles from each page, as we
 * have the title in the top nav bar" -- `AppHeader.tsx` already shows
 * "Deal stats" for this route via `ROUTE_TITLES`, so a same-page "Me"
 * label (already stale next to that title anyway) was a plain duplicate.
 * The hero `<h1>` further down ("How Dodgy Deal works for you")
 * is deliberately kept -- it's a distinct tagline, not a restated page
 * name, so it isn't the kind of duplicate this request was about.
 */
export default function MePage() {
  const { user, isAnonymousSession, loading: authLoading, openAuthSheet } = useAuth();
  const { products, loadingProducts, toggleStore, setDealFilter } = useSearch();
  const [stats, setStats] = useState<DealStats | null>(null);
  const [history, setHistory] = useState<DealCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(true);
  const [isMonthlyPulseOpen, setIsMonthlyPulseOpen] = useState(false);
  const [isValueRankingOpen, setIsValueRankingOpen] = useState(true);
  const [isPriceChangeOpen, setIsPriceChangeOpen] = useState(false);
  const [isTopChangedItemsOpen, setIsTopChangedItemsOpen] = useState(false);
  const [isSavingsOpen, setIsSavingsOpen] = useState(true);
  // Same plain-counter retry pattern established across this app on
  // 2026-08-11 (search-context.tsx/specials/page.tsx/lists/page.tsx) —
  // lets ErrorState's Try Again button re-run the fetch below.
  const [retryTick, setRetryTick] = useState(0);
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchDealCheckHistory(requireAccountsSupabaseClient(), { limit: 1000 })
      .then((history) => {
        if (!cancelled) {
          setHistory(history);
          setStats(computeDealStats(history));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeFetchError(err, "Failed to load your deal stats"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, retryTick]);

  const currentStoreStats = useMemo(() => buildCurrentStoreStats(products), [products]);
  const monthlyStats = useMemo(() => buildMonthlyStats(products), [products]);
  const storeRankings = useMemo(() => buildStoreRankings(products), [products]);
  const priceChangeStats = useMemo(
    () => buildPriceChangeStats(products, STATS_STORES.map(({ key, label }) => ({ key, store: label }))),
    [products]
  );
  const lowestValueRanking = [...storeRankings].reverse().find((store) => store.realDeals > 0);
  const monthlySpotlight = useMemo(() => {
    return STATS_STORES.map(({ key, label }) => {
      const storeMonths = monthlyStats.flatMap((month) => month.stores.filter((store) => store.key === key));
      return {
        store: label,
        real: storeMonths.reduce((sum, month) => sum + month.real, 0),
        dodgy: storeMonths.reduce((sum, month) => sum + month.dodgy, 0),
      };
    }).sort((a, b) => b.real - a.real || b.dodgy - a.dodgy)[0];
  }, [monthlyStats]);

  const openFilteredDeals = useCallback(
    (storeKey: string, filter: Extract<DealFilter, "real" | "dodgy">) => {
      toggleStore("all");
      toggleStore(storeKey);
      setDealFilter(filter);
    },
    [setDealFilter, toggleStore]
  );

  if (authLoading) {
    return (
      <main className="flex flex-col gap-3 pb-8">
        {/* `blurred` added 2026-08-20, per Jay: "All checks and Deal stats
            pages - remove the search bar's white background (container
            fill) to match the Check deals page." -- was a bare
            `<SearchBar />` (default variant, not blurred), which renders
            an opaque `bg-white` sticky wrapper (`SearchBar.tsx`'s own
            ternary); `blurred` swaps that for the same transparent +
            `backdrop-blur-md` treatment Home's search bar already uses.
            Scoped to just the wrapper fill -- this page's pill still keeps
            its own `border-stone-300` at rest (unlike Home's, see
            `page.tsx`'s own same-day `variant="shadow"` change) since Jay's
            two asks were separate: this one about the container fill only,
            not the pill's stroke. Same change, same reasoning, at this
            file's other 2 `<SearchBar>` call sites below (short pointer
            comment there instead of repeating this in full 3 times). */}
        <div className="flex flex-col gap-3 px-5 pt-4">
          <LoadingMascot loading />
        </div>
      </main>
    );
  }

  // 2026-08-19, per Jay: bottom sheet, not a full-page swap -- see
  // lists/page.tsx's own version of this comment.
  if (!user) {
    const prompt = "Log in to see your deal checks, Real Deals found and estimated savings.";
    return (
      <main className="flex flex-col gap-4 pt-6 pb-8">
        {/* `blurred`, 2026-08-20 -- see this file's other 2 `<SearchBar>`
            call sites for the full "why" (same change, same reasoning, all
            3 branches of this page). */}
        <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
          <MascotImage
            src="/deal-stats-login.webp"
                    darkSrc="/deal-stats-login-dark.webp"
            alt="An ascending savings chart with a check mark"
            width={288}
            height={263}
            sizes="144px"
            preload
            unoptimized
            className="mascot-wave h-auto w-full max-w-[9rem]"
          />
          <p className="max-w-xs px-4 text-sm font-bold text-stone-700">{prompt}</p>
          <button
            type="button"
            onClick={() => openAuthSheet(prompt)}
            className="dd-btn dd-btn-primary cursor-pointer"
          >
            Log in or create an account
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 pb-8">
      {/* `blurred`, 2026-08-20 -- see this file's other 2 `<SearchBar>` call
          sites for the full "why" (same change, same reasoning, all 3
          branches of this page). */}
      <header className="px-5 pt-6 text-center">
        {/* The stats mascot gently floats so the detailed calculating pose
            feels alive without reading as a loading indicator. This local
            image is served directly because the deployed image optimizer can
            reject it with a 402, leaving the hero blank in the iOS WebView. */}
        <MascotImage
          src="/deal-stats-calculating.webp"
                      darkSrc="/deal-stats-calculating-dark.webp"
          alt="Dodgy Deal mascot calculating deal statistics"
          width={320}
          height={292}
          sizes="160px"
          priority
          unoptimized
          className="animate-deal-stats-mascot mx-auto mb-2 h-auto w-36 sm:w-40"
        />
        <h1 className="dd-type-section text-stone-900">
          How Dodgy Deal works for you
        </h1>
      </header>

      {isAnonymousSession && (
        // Same amber "dev tool" language/styling as lists/page.tsx and
        // /history's own Test Mode notice. Copy updated 2026-08-13 -- the
        // test account is a real Supabase anonymous sign-in now (see
        // auth-context.tsx's own doc comment), so these stats genuinely
        // reflect real check history like any other signed-in user; this
        // no longer claims stats "will always show zero," it explains
        // this anonymous test account cannot be accessed from another device.
        <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3">
          <p className="dd-type-meta dd-type-meta-strong text-amber-700">Test mode</p>
          <p className="dd-type-secondary text-amber-700">
            You&rsquo;re using a test account. These stats are real, but you can&rsquo;t sign in to this account on
            another device.
          </p>
        </div>
      )}

      <div className={`relative ${loading ? "min-h-[112px]" : ""}`}>
        <div className="pointer-events-none absolute inset-0 z-10">
          <LoadingMascot loading={loading} />
        </div>

        {error && <ErrorState message="Couldn't load your deal stats." detail={error} onRetry={retry} />}

        {!loading && !error && stats && (
          <div className="flex flex-col gap-4 px-5">
            <div className="grid grid-cols-3 divide-x divide-stone-100 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
              <StatCell
                label={
                  <>
                    <span>Deals</span>
                    <span>Checked</span>
                  </>
                }
                value={stats.totalChecked}
                valueClassName="text-stone-900"
              />
              <StatCell label="Real savers found" value={stats.realSavers} valueClassName="text-fair-600" labelClassName="text-fair-600" />
              <StatCell label="Dodgy deals spotted" value={stats.dodgySpotted} valueClassName="text-alert-600" labelClassName="text-alert-600" />
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setIsBreakdownOpen((open) => !open)}
                aria-expanded={isBreakdownOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block dd-type-section text-stone-900">Current deals by supermarket</span>
                  <span className="mt-1 block dd-type-secondary text-stone-500">
                    Current specials from the last 90 days. Tap a number to browse that supermarket&rsquo;s deals.
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-stone-500 transition-transform ${isBreakdownOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isBreakdownOpen && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-12 gap-2 border-b border-stone-100 pb-1 dd-type-meta dd-type-meta-strong text-stone-500">
                    <span className="col-span-6">Supermarket</span>
                    <span className="col-span-3 text-center">Real savers</span>
                    <span className="col-span-3 text-center">Dodgy deals</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {currentStoreStats.map((store) => (
                      <div key={store.key} className="grid grid-cols-12 items-center gap-2 border-b border-stone-100 py-1.5 last:border-0">
                        <span className="col-span-6 dd-type-secondary dd-type-secondary-strong text-stone-800">{store.store}</span>
                        <div className="col-span-3 text-center">
                          <Link
                            href="/"
                            onClick={() => openFilteredDeals(store.key, "real")}
                            aria-label={`View ${store.real} real saver deals at ${store.store}`}
                            className="inline-flex min-w-[42px] items-center justify-center gap-0.5 rounded-md bg-fair-50 px-2 py-1 text-base font-black tabular-nums text-fair-700 transition-colors hover:bg-fair-100"
                          >
                            {loadingProducts ? "…" : store.real}
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                        <div className="col-span-3 text-center">
                          <Link
                            href="/"
                            onClick={() => openFilteredDeals(store.key, "dodgy")}
                            aria-label={`View ${store.dodgy} dodgy deals at ${store.store}`}
                            className="inline-flex min-w-[42px] items-center justify-center gap-0.5 rounded-md bg-alert-50 px-2 py-1 text-base font-black tabular-nums text-alert-700 transition-colors hover:bg-alert-100"
                          >
                            {loadingProducts ? "…" : store.dodgy}
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setIsMonthlyPulseOpen((open) => !open)}
                aria-expanded={isMonthlyPulseOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block dd-type-section text-stone-900">Specials by month</span>
                  <span className="mt-1 block dd-type-secondary text-stone-500">
                    Current specials, grouped by the month they started.
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-stone-500 transition-transform ${isMonthlyPulseOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isMonthlyPulseOpen && (
                <div className="flex flex-col gap-4">
                  {monthlySpotlight && monthlySpotlight.real > 0 && (
                    <div className="rounded-2xl border border-fair-100 bg-fair-50 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-fair-700">Most Real Saver specials</p>
                          <p className="mt-2 text-xl font-bold leading-tight tracking-tight text-fair-950">{monthlySpotlight.store}</p>
                          <p className="mt-1 dd-type-secondary text-fair-800">In the last 90 days</p>
                        </div>
                        <div className="flex min-w-[4.5rem] flex-shrink-0 flex-col items-center rounded-xl bg-white/80 px-3 py-2.5 text-center shadow-xs">
                          <span className="text-2xl font-black leading-none tabular-nums text-fair-700">{monthlySpotlight.real}</span>
                          <span className="mt-1 text-[11px] font-bold leading-tight text-fair-800">Real Saver specials</span>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-fair-100 pt-3">
                        <span className="dd-type-meta text-fair-800">Dodgy specials</span>
                        <span className="text-sm font-bold tabular-nums text-alert-700">{monthlySpotlight.dodgy}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {monthlyStats.map((month) => (
                      <div key={month.key} className="rounded-xl border border-stone-100 bg-stone-50/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="dd-type-control text-stone-800">{month.label}</p>
                          <p className="dd-type-meta text-stone-500">
                            {month.stores.reduce((sum, store) => sum + store.real + store.dodgy, 0)} deals
                          </p>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-2 border-b border-stone-200 pb-1 dd-type-meta dd-type-meta-strong text-stone-500">
                          <span>Supermarket</span>
                          <span className="text-center text-fair-700">Real</span>
                          <span className="text-center text-alert-700">Dodgy</span>
                        </div>
                        <div className="divide-y divide-stone-100">
                          {month.stores.map((store) => (
                            <div key={store.key} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-2 py-2 last:pb-0">
                              <span className="truncate dd-type-secondary dd-type-secondary-strong text-stone-700">{store.store}</span>
                              <span className="text-center text-base font-black tabular-nums text-fair-700">{store.real}</span>
                              <span className="text-center text-base font-black tabular-nums text-alert-700">{store.dodgy}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setIsValueRankingOpen((open) => !open)}
                aria-expanded={isValueRankingOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block dd-type-section text-stone-900">Best value by supermarket</span>
                  <span className="mt-1 block dd-type-secondary text-stone-500">
                    Ranks supermarkets by average discount on current Real Saver specials over the last 90 days. The dollar total adds one discount per deal.
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-stone-500 transition-transform ${isValueRankingOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isValueRankingOpen && (
                <div className="flex flex-col gap-4">
                  {loadingProducts ? (
                    <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">Loading supermarket rankings&hellip;</p>
                  ) : storeRankings[0]?.realDeals ? (
                    <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-fair-200 bg-fair-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-fair-700">Best value</p>
                      <div className="mt-3 flex flex-col gap-1">
                        <p className="text-lg font-bold leading-tight text-fair-950">{storeRankings[0].store}</p>
                        <p className="dd-type-meta text-fair-800">Last 90 days</p>
                      </div>
                      <p className="mt-4 text-3xl font-black leading-none tabular-nums text-fair-700">
                        {formatPercent(storeRankings[0].averageDiscount)}
                      </p>
                      <p className="mt-1 text-[12px] font-semibold text-fair-800">average discount</p>
                      <p className="mt-3 dd-type-meta text-fair-800">
                        Based on {storeRankings[0].realDeals} {storeRankings[0].realDeals === 1 ? "deal" : "deals"}
                      </p>
                    </div>
                    {lowestValueRanking && (
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-500">Lowest average discount</p>
                        <div className="mt-3 flex flex-col gap-1">
                          <p className="text-lg font-semibold leading-tight text-stone-800">{lowestValueRanking.store}</p>
                          <p className="dd-type-meta text-stone-500">Last 90 days</p>
                        </div>
                        <p className="mt-4 text-3xl font-bold leading-none tabular-nums text-stone-700">
                          {formatPercent(lowestValueRanking.averageDiscount)}
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-stone-500">average discount</p>
                        <p className="mt-3 dd-type-meta text-stone-500">
                          Based on {lowestValueRanking.realDeals} {lowestValueRanking.realDeals === 1 ? "deal" : "deals"}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col divide-y divide-stone-100">
                    {storeRankings.map((store, index) => (
                      <div key={store.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-black tabular-nums text-stone-600">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="dd-type-control truncate text-stone-800">{store.store}</p>
                          <p className="dd-type-meta text-stone-500">
                            {store.realDeals} {store.realDeals === 1 ? "deal" : "deals"} &middot; {formatCurrency(store.totalSavings)} combined discounts
                          </p>
                        </div>
                        <span className="text-right text-base font-black tabular-nums text-fair-700">
                          {formatPercent(store.averageDiscount)}
                        </span>
                      </div>
                    ))}
                  </div>
                    </>
                  ) : (
                    <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">
                      No current Real Saver deals to rank yet.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setIsPriceChangeOpen((open) => !open)}
                aria-expanded={isPriceChangeOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block dd-type-section text-stone-900">How often prices change</span>
                  <span className="mt-1 block dd-type-secondary text-stone-500">
                    How many current specials changed price in the last 90 days.
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-stone-500 transition-transform ${isPriceChangeOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isPriceChangeOpen && (
                <div className="flex flex-col gap-4">
                  <p className="dd-type-secondary text-stone-500">
                    Bars show the share of items with at least one price change. We need at least two recorded prices to compare.
                  </p>

                  {loadingProducts ? (
                    <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">Loading price changes&hellip;</p>
                  ) : priceChangeStats.stores.some((store) => store.itemsTracked > 0) ? (
                    <>
                      <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-600">Most often</p>
                            <p className="mt-2 text-xl font-bold leading-tight tracking-tight text-stone-900">{priceChangeStats.stores[0].store}</p>
                            <p className="mt-1 dd-type-secondary text-stone-500">More of its specials changed price than at other supermarkets</p>
                          </div>
                          <div className="flex min-w-[4.5rem] flex-shrink-0 flex-col items-center rounded-xl bg-white/80 px-3 py-2.5 text-center shadow-xs">
                            <span className="text-2xl font-black leading-none tabular-nums text-ink-700">
                              {priceChangeStats.stores[0].changeRatePct}%
                            </span>
                            <span className="mt-1 text-[11px] font-bold leading-tight text-stone-500">of items changed</span>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                          <span className="dd-type-meta text-stone-500">Items with a price change</span>
                          <span className="text-sm font-bold tabular-nums text-stone-700">
                            {priceChangeStats.stores[0].itemsChanged} of {priceChangeStats.stores[0].itemsTracked}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        {priceChangeStats.stores.filter((store) => store.itemsTracked > 0).map((store) => (
                          <div key={store.key}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                              <p className="dd-type-control text-stone-800">{store.store}</p>
                              <p className="dd-type-meta font-bold tabular-nums text-stone-600">
                                {store.changeRatePct}% of items
                              </p>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                              <div
                                className="dd-price-change-bar h-full rounded-full transition-[width]"
                                style={{
                                  width: `${priceChangeStats.stores[0].changeRatePct > 0 ? Math.max(4, (store.changeRatePct / priceChangeStats.stores[0].changeRatePct) * 100) : 0}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1 dd-type-meta text-stone-500">
                              {store.itemsChanged} of {store.itemsTracked} items changed · {store.totalChanges} {store.totalChanges === 1 ? "price change" : "price changes"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">
                      We&rsquo;ll show this once more current specials have at least two recorded prices to compare.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setIsTopChangedItemsOpen((open) => !open)}
                aria-expanded={isTopChangedItemsOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block dd-type-section text-stone-900">Items with the most price changes</span>
                  <span className="mt-1 block dd-type-secondary text-stone-500">
                    Current specials with the most price changes across supermarkets in the last 90 days.
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-stone-500 transition-transform ${isTopChangedItemsOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isTopChangedItemsOpen && (
                loadingProducts ? (
                  <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">
                    Loading price changes&hellip;
                  </p>
                ) : priceChangeStats.topProducts.length ? (
                  <div className="flex flex-col divide-y divide-stone-100">
                    {priceChangeStats.topProducts.map((product, index) => (
                      <div key={product.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-50 text-sm font-black tabular-nums text-ink-700">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="dd-type-meta truncate text-stone-500">{product.brand}</p>
                          <p className="dd-type-control text-stone-800">{product.name}</p>
                          <p className="dd-type-meta text-stone-500">Across {product.storeCount} {product.storeCount === 1 ? "supermarket" : "supermarkets"}</p>
                        </div>
                        <span className="flex-shrink-0 text-right text-base font-black tabular-nums text-ink-700">
                          {product.totalChanges} {product.totalChanges === 1 ? "change" : "changes"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">
                    No price changes recorded for current specials yet. We need at least two prices to spot a change.
                  </p>
                )
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-fair-100/80 bg-fair-50/40 p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setIsSavingsOpen((open) => !open)}
                aria-expanded={isSavingsOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block dd-type-section text-fair-950">Estimated savings</span>
                  <span className="mt-1 block dd-type-secondary text-fair-800">Estimated price drops across the deals you checked.</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="dd-type-display tabular-nums text-fair-700">${stats.moneySaved.toFixed(2)}</span>
                  <ChevronDown
                    className={`h-5 w-5 flex-shrink-0 text-fair-700 transition-transform ${isSavingsOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </span>
              </button>
              {isSavingsOpen && (
                <div className="rounded-xl border border-fair-100 bg-white/95 p-4">
                  <p className="mb-1.5 dd-type-meta dd-type-meta-strong text-fair-800">How we calculate this</p>
                  <p className="dd-type-secondary text-stone-600">
                    For each checked deal priced below its reference price, we count the difference. This is an estimate,
                    not a record of what you saved at checkout.
                  </p>
                </div>
              )}
            </div>

            <Link
              href="/history"
              className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4 dd-type-control text-stone-800 shadow-xs transition-colors hover:bg-stone-50"
            >
              <span>View your deal check history</span>
              <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);
}

function StatCell({
  label,
  value,
  valueClassName,
  labelClassName = "text-stone-500",
}: {
  label: ReactNode;
  value: number;
  valueClassName: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-2 px-1 text-center">
      <span className={`flex min-h-[32px] w-full flex-col items-center justify-start dd-type-meta dd-type-meta-strong leading-tight ${labelClassName}`}>
        {label}
      </span>
      <span className={`dd-type-page-title tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}
