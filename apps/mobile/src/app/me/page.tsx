"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  computeDealStats,
  buildPriceChangeStats,
  describeFetchError,
  matchesAnySelectedStore,
  STORE_DISPLAY_FALLBACK,
  type CurrentDeal,
  type DealStats,
  type ProductCard,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { fetchDealCheckHistoryFromApi } from "@/lib/deal-check-history-api";
import LoadingMascot from "@/components/LoadingMascot";
import ErrorState from "@/components/ErrorState";
import { matchesDealFilter, type DealFilter } from "@/lib/deal-filters";
import { useSearch } from "@/lib/search-context";
import { useWatchlist } from "@/lib/watchlist-context";
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

interface MonthlySummary {
  key: string;
  label: string;
  real: number;
  dodgy: number;
  total: number;
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
  const { user, session, isAnonymousSession, loading: authLoading, openAuthSheet } = useAuth();
  const { products, loadingProducts, toggleStore, setDealFilter } = useSearch();
  const { savedProductIds } = useWatchlist();
  const [stats, setStats] = useState<DealStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingsOpen, setIsSavingsOpen] = useState(true);
  const [activeStatsTab, setActiveStatsTab] = useState<"activity" | "trends">("activity");
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
    if (!user || !session?.access_token) return;
    let cancelled = false;
    fetchDealCheckHistoryFromApi(session.access_token, { scope: "stats" })
      .then(({ rows }) => {
        if (!cancelled) {
          setStats(computeDealStats(rows));
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
  }, [user, session?.access_token, retryTick]);

  const currentStoreStats = useMemo(() => buildCurrentStoreStats(products), [products]);
  const monthlyStats = useMemo(() => buildMonthlyStats(products), [products]);
  const storeRankings = useMemo(() => buildStoreRankings(products), [products]);
  const priceChangeStats = useMemo(
    () => buildPriceChangeStats(products, STATS_STORES.map(({ key, label }) => ({ key, store: label }))),
    [products]
  );
  const bestValueRanking = storeRankings.find((store) => store.realDeals > 0);
  const mostPriceChangeStore = priceChangeStats.stores.find((store) => store.itemsTracked > 0);
  const chronologicalMonthlySummaries = useMemo<MonthlySummary[]>(
    () =>
      [...monthlyStats].reverse().map((month) => {
        const real = month.stores.reduce((sum, store) => sum + store.real, 0);
        const dodgy = month.stores.reduce((sum, store) => sum + store.dodgy, 0);
        return { key: month.key, label: month.label, real, dodgy, total: real + dodgy };
      }),
    [monthlyStats]
  );
  const maxCurrentSpecials = useMemo(
    () => Math.max(1, ...currentStoreStats.map((store) => store.real + store.dodgy)),
    [currentStoreStats]
  );
  const maxMonthlySpecials = useMemo(
    () => Math.max(1, ...chronologicalMonthlySummaries.map((month) => month.total)),
    [chronologicalMonthlySummaries]
  );
  const maxAverageDiscount = useMemo(
    () => Math.max(1, ...storeRankings.map((store) => store.averageDiscount)),
    [storeRankings]
  );
  const maxPriceChangeRate = useMemo(
    () => Math.max(1, ...priceChangeStats.stores.map((store) => store.changeRatePct)),
    [priceChangeStats.stores]
  );
  const monthlySpotlight = useMemo(() => {
    const spotlight = STATS_STORES.map(({ key, label }) => {
      const storeMonths = monthlyStats.flatMap((month) => month.stores.filter((store) => store.key === key));
      return {
        store: label,
        real: storeMonths.reduce((sum, month) => sum + month.real, 0),
        dodgy: storeMonths.reduce((sum, month) => sum + month.dodgy, 0),
      };
    }).sort((a, b) => b.real - a.real || b.dodgy - a.dodgy)[0];
    return spotlight?.real ? spotlight : null;
  }, [monthlyStats]);
  const busiestMonth = useMemo(
    () => chronologicalMonthlySummaries.reduce<MonthlySummary | null>((busiest, month) => (!busiest || month.total > busiest.total ? month : busiest), null),
    [chronologicalMonthlySummaries]
  );

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
    const prompt = "Log in to see your deal checks, Real Savers found and estimated savings.";
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
      <div
        className="dd-segmented-control relative mx-5 mt-4 flex h-11 items-center gap-0.5 rounded-full bg-white ring-1 ring-stone-200 shadow-sm shadow-black/5"
        role="tablist"
        aria-label="Deal stats views"
      >
        {([
          ["activity", "Your Activity"],
          ["trends", "NZ Trends"],
        ] as const).map(([tab, label]) => {
          const isActive = activeStatsTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`deal-stats-tab-${tab}`}
              aria-selected={isActive}
              aria-controls={`deal-stats-panel-${tab}`}
              onClick={() => setActiveStatsTab(tab)}
              className={`relative z-0 flex h-11 flex-1 cursor-pointer appearance-none items-center justify-center rounded-full px-3 py-1 text-center dd-type-control transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1 ${
                isActive
                  ? "dd-segmented-control-active bg-ink-900 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
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
          {activeStatsTab === "trends" ? "NZ Trends in supermarket specials" : "How Dodgy Deal works for you"}
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

      <div
        id={`deal-stats-panel-${activeStatsTab}`}
        role="tabpanel"
        aria-labelledby={`deal-stats-tab-${activeStatsTab}`}
        className={`relative ${activeStatsTab === "activity" && loading ? "min-h-[112px]" : ""}`}
      >
        <div className="pointer-events-none absolute inset-0 z-10">
          <LoadingMascot loading={activeStatsTab === "activity" && loading} />
        </div>

        {activeStatsTab === "activity" && error && <ErrorState message="Couldn't load your deal stats." detail={error} onRetry={retry} />}

        {(activeStatsTab === "trends" || (!loading && !error && stats)) && (
          <div className="flex flex-col gap-4 px-5">
            {activeStatsTab === "activity" && stats && (
            <>
            <div className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
              <div>
                <h2 className="dd-type-section text-stone-900">Your activity</h2>
                <p className="mt-1 dd-type-secondary text-stone-500">Your stats below based on your app usage.</p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-stone-100">
              <StatCell
                label={
                  <>
                    <span>Deals</span>
                    <span>Checked</span>
                  </>
                }
                value={stats.totalChecked}
                valueClassName="text-stone-900"
                href="/history"
                ariaLabel="View all your deal checks"
              />
              <StatCell label="Real savers found" value={stats.realSavers} valueClassName="text-fair-600" labelClassName="text-fair-600" href="/history?verdict=real" ariaLabel="View checks where you found Real Savers" />
              <StatCell label="Dodgy Deals spotted" value={stats.dodgySpotted} valueClassName="text-alert-600" labelClassName="text-alert-600" href="/history?verdict=dodgy" ariaLabel="View checks where you spotted Dodgy Deals" />
              </div>
            </div>

            <Link
              href="/lists"
              className="flex w-full items-center justify-between rounded-2xl border border-ink-100 bg-ink-50/60 px-5 py-4 text-left shadow-xs transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-600"
            >
              <span className="min-w-0">
                <span className="block dd-type-control text-stone-900">Your Watchlist</span>
                <span className="mt-1 block text-2xl font-black leading-none tabular-nums text-ink-700">{savedProductIds.size}</span>
                <span className="mt-1 block dd-type-meta text-stone-500">Saved products with live verdicts and price alerts</span>
              </span>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-ink-700" aria-hidden="true" />
            </Link>
            </>
            )}

            {activeStatsTab === "trends" && (
            <div className="flex flex-col gap-4">
              {loadingProducts ? (
                <p className="rounded-2xl border border-stone-100 bg-white p-5 text-center dd-type-secondary text-stone-500">
                  Loading NZ trends&hellip;
                </p>
              ) : (
                <>
                  <div className="rounded-2xl bg-ink-900 p-5 text-white shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-200">NZ market pulse</p>
                        <p className="mt-1 text-sm font-semibold text-white/75">Current specials · 90-day view</p>
                      </div>
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">Live</span>
                    </div>
                    <div className="mt-5 grid grid-cols-3 divide-x divide-white/15">
                      <TrendInsightStat
                        label="Most real savers"
                        value={monthlySpotlight ? String(monthlySpotlight.real) : "—"}
                        detail={monthlySpotlight?.store ?? "No data yet"}
                      />
                      <TrendInsightStat
                        label="Best avg discount"
                        value={bestValueRanking ? formatPercent(bestValueRanking.averageDiscount) : "—"}
                        detail={bestValueRanking?.store ?? "No data yet"}
                      />
                      <TrendInsightStat
                        label="Most price movement"
                        value={mostPriceChangeStore ? String(mostPriceChangeStore.changeRatePct) + "%" : "—"}
                        detail={mostPriceChangeStore?.store ?? "No data yet"}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
                    <div>
                      <h2 className="dd-type-section text-stone-900">Deal mix by supermarket</h2>
                      <p className="mt-1 dd-type-secondary text-stone-500">Real Savers and Dodgy Deals in the current 90-day view.</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 dd-type-meta text-stone-500">
                        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fair-500" aria-hidden="true" />Real Saver</span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-alert-500" aria-hidden="true" />Dodgy Deal</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-5">
                      {currentStoreStats.map((store) => {
                        const total = store.real + store.dodgy;
                        const realWidth = total ? (store.real / maxCurrentSpecials) * 100 : 0;
                        const dodgyWidth = total ? (store.dodgy / maxCurrentSpecials) * 100 : 0;
                        return (
                          <div key={store.key}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                              <span className="dd-type-control text-stone-800">{store.store}</span>
                              <span className="dd-type-meta font-bold tabular-nums text-stone-500">{total} specials</span>
                            </div>
                            <div
                              role="img"
                              aria-label={store.store + ": " + store.real + " Real Savers and " + store.dodgy + " Dodgy Deals, " + total + " specials total"}
                              className="flex h-3 overflow-hidden rounded-full bg-stone-100"
                            >
                              <span className="bg-fair-500 transition-[width]" style={{ width: String(realWidth) + "%" }} />
                              <span className="bg-alert-500 transition-[width]" style={{ width: String(dodgyWidth) + "%" }} />
                            </div>
                            <div className="mt-1.5 flex items-center gap-3 dd-type-meta">
                              <Link href="/" onClick={() => openFilteredDeals(store.key, "real")} aria-label={"View " + store.real + " Real Saver deals at " + store.store} className="font-bold text-fair-700 underline decoration-fair-300 underline-offset-2">{store.real} Real Savers</Link>
                              <Link href="/" onClick={() => openFilteredDeals(store.key, "dodgy")} aria-label={"View " + store.dodgy + " Dodgy Deals at " + store.store} className="font-bold text-alert-700 underline decoration-alert-300 underline-offset-2">{store.dodgy} Dodgy</Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
                    <div>
                      <h2 className="dd-type-section text-stone-900">When did current specials start?</h2>
                      <p className="mt-1 dd-type-secondary text-stone-500">The month each current special was first recorded.</p>
                    </div>
                    {busiestMonth?.total ? (
                      <p className="rounded-xl bg-ink-50 px-3.5 py-3 dd-type-secondary text-ink-900">
                        <span className="font-bold">{busiestMonth.label}</span> has the most current specials still running ({busiestMonth.total}).
                      </p>
                    ) : (
                      <p className="rounded-xl bg-stone-50 px-3.5 py-3 dd-type-secondary text-stone-500">No current specials to chart yet.</p>
                    )}
                    {busiestMonth?.total ? (
                      <div className="flex flex-col gap-5" role="list" aria-label="Current specials by start month">
                        {chronologicalMonthlySummaries.map((month) => {
                          const realWidth = (month.real / maxMonthlySpecials) * 100;
                          const dodgyWidth = (month.dodgy / maxMonthlySpecials) * 100;
                          return (
                            <div key={month.key} role="listitem">
                              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                                <span className="dd-type-control text-stone-800">{month.label}</span>
                                <span className="dd-type-meta font-bold tabular-nums text-stone-600">{month.total} {month.total === 1 ? "special" : "specials"}</span>
                              </div>
                              <div
                                role="img"
                                aria-label={month.label + ": " + month.total + " current specials, " + month.real + " Real Savers and " + month.dodgy + " Dodgy Deals"}
                                className="flex h-3 overflow-hidden rounded-full bg-stone-100"
                              >
                                <span className="bg-fair-500 transition-[width]" style={{ width: String(realWidth) + "%" }} />
                                <span className="bg-alert-500 transition-[width]" style={{ width: String(dodgyWidth) + "%" }} />
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 dd-type-meta">
                                <span className="text-fair-700"><span className="font-bold tabular-nums">{month.real}</span> Real Savers</span>
                                <span className="text-alert-700"><span className="font-bold tabular-nums">{month.dodgy}</span> Dodgy Deals</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
                    <div>
                      <h2 className="dd-type-section text-stone-900">Best average discounts</h2>
                      <p className="mt-1 dd-type-secondary text-stone-500">Real Saver discounts by supermarket.</p>
                    </div>
                    {bestValueRanking ? (
                      <div className="flex flex-col gap-4">
                        {storeRankings.filter((store) => store.realDeals > 0).map((store, index) => (
                          <Link key={store.key} href="/" onClick={() => openFilteredDeals(store.key, "real")} aria-label={"Browse " + store.store + " Real Saver deals averaging " + formatPercent(store.averageDiscount)} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
                            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                              <span className="dd-type-control text-stone-800"><span className="mr-1.5 text-stone-400">{index + 1}.</span>{store.store}</span>
                              <span className="text-base font-black tabular-nums text-fair-700">{formatPercent(store.averageDiscount)}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                              <div className="h-full rounded-full bg-fair-500 transition-[width]" style={{ width: String((store.averageDiscount / maxAverageDiscount) * 100) + "%" }} />
                            </div>
                            <div className="mt-1 flex justify-between gap-3 dd-type-meta text-stone-500">
                              <span>{store.realDeals} {store.realDeals === 1 ? "deal" : "deals"}</span>
                              <span>{formatCurrency(store.totalSavings)} combined</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">No current Real Saver deals to rank yet.</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs">
                    <div>
                      <h2 className="dd-type-section text-stone-900">Price movement</h2>
                      <p className="mt-1 dd-type-secondary text-stone-500">The share of tracked items with a recorded price change.</p>
                    </div>
                    {mostPriceChangeStore ? (
                      <>
                        <div className="flex flex-col gap-4">
                          {priceChangeStats.stores.filter((store) => store.itemsTracked > 0).map((store) => (
                            <div key={store.key}>
                              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                                <span className="dd-type-control text-stone-800">{store.store}</span>
                                <Link href="/" onClick={() => { toggleStore("all"); toggleStore(store.key); }} aria-label={"Browse current deals at " + store.store} className="dd-type-meta font-bold tabular-nums text-stone-600 underline decoration-stone-300 underline-offset-2">{store.changeRatePct}% changed</Link>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={store.store + ": " + store.changeRatePct + "% of tracked items changed price"}>
                                <div className="dd-price-change-bar h-full rounded-full transition-[width]" style={{ width: String((store.changeRatePct / maxPriceChangeRate) * 100) + "%" }} />
                              </div>
                              <p className="mt-1 dd-type-meta text-stone-500">{store.itemsChanged} of {store.itemsTracked} items</p>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-stone-100 pt-4">
                          <p className="mb-2 dd-type-meta dd-type-meta-strong uppercase tracking-[0.08em] text-stone-500">Most changed items</p>
                          {priceChangeStats.topProducts.length > 0 ? (
                            <div className="flex flex-col divide-y divide-stone-100">
                              {priceChangeStats.topProducts.slice(0, 3).map((product, index) => (
                                <Link key={product.id} href={"/deal/" + encodeURIComponent(product.id) + "/" + encodeURIComponent(product.store)} aria-label={"View " + product.name + " deal assessment at " + product.store} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2">
                                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-50 text-sm font-black tabular-nums text-ink-700">{index + 1}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block dd-type-meta truncate text-stone-500">{product.brand}</span>
                                    <span className="block dd-type-control truncate text-stone-800">{product.name}</span>
                                    <span className="block dd-type-meta text-stone-500">Across {product.storeCount} {product.storeCount === 1 ? "supermarket" : "supermarkets"}</span>
                                  </span>
                                  <span className="flex-shrink-0 text-right text-base font-black tabular-nums text-ink-700">{product.totalChanges} {product.totalChanges === 1 ? "change" : "changes"}</span>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">No price changes yet.</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">Not enough price history yet — we need two prices to compare.</p>
                    )}
                  </div>
                </>
              )}
            </div>
            )}

            {activeStatsTab === "activity" && stats && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 rounded-2xl border border-fair-100/80 bg-fair-50/40 p-5 shadow-xs">
              <button
                type="button"
                onClick={() => setIsSavingsOpen((open) => !open)}
                aria-expanded={isSavingsOpen}
                className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block dd-type-section text-fair-950">Estimated savings</span>
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
  href,
  ariaLabel,
}: {
  label: ReactNode;
  value: number;
  valueClassName: string;
  labelClassName?: string;
  href?: string;
  ariaLabel?: string;
}) {
  const content = (
    <div className="flex flex-col items-center justify-between gap-2 px-1 text-center">
      <span className={`flex min-h-[32px] w-full flex-col items-center justify-start dd-type-meta dd-type-meta-strong leading-tight ${labelClassName}`}>
        {label}
      </span>
      <span className={`dd-type-page-title tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
  return href ? (
    <Link href={href} aria-label={ariaLabel} className="rounded-lg outline-none transition-colors hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1">
      {content}
    </Link>
  ) : content;
}

function TrendInsightStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0">
      <p className="min-h-8 text-[10px] font-bold leading-tight text-white/65">{label}</p>
      <p className="mt-1 text-xl font-black leading-none tabular-nums text-white">{value}</p>
      <p className="mt-1 truncate text-[10px] font-semibold leading-tight text-white/80">{detail}</p>
    </div>
  );
}
