"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import {
  buildPriceChangeStats,
  matchesAnySelectedStore,
  STORE_DISPLAY_FALLBACK,
  type CurrentDeal,
  type ProductCard,
} from "@dodgey-deals/shared";
import LoadingMascot from "@/components/LoadingMascot";
import MascotImage from "@/components/MascotImage";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import StickySubscriptionCta from "@/components/StickySubscriptionCta";
import { useAuth } from "@/lib/auth-context";
import { matchesDealFilter, type DealFilter } from "@/lib/deal-filters";
import { getLockedPreviewOpacity } from "@/lib/locked-preview";
import { useSearch } from "@/lib/search-context";
import { useSubscriptions } from "@/lib/subscription-context";
import { useWatchlist } from "@/lib/watchlist-context";
import { buildWatchlistStats, type WatchlistStats, type WatchlistTopMode } from "@/lib/watchlist-stats";

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

function bestCurrentDeal(product: ProductCard, storeKey: string, filter: DealFilter, sinceTimestamp?: number): CurrentDeal | undefined {
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
    const averageDiscount = discounts.length ? discounts.reduce((sum, deal) => sum + deal.discountPercentage, 0) / discounts.length : 0;
    const totalSavings = deals.reduce((sum, deal) => sum + Math.max(0, deal.originalPrice - deal.price), 0);
    return { key, store: label, realDeals: deals.length, averageDiscount, totalSavings };
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
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: formatter.format(date) };
  });
}

function buildMonthlyStats(products: ProductCard[]): MonthlyStats[] {
  const months = recentMonthKeys();
  const byMonth = new Map<string, MonthlyStoreStats[]>();
  const sinceTimestamp = Date.now() - NINETY_DAYS_MS;
  for (const month of months) {
    byMonth.set(month.key, STATS_STORES.map(({ key, label }) => ({
      key,
      store: label,
      real: 0,
      dodgy: 0,
      realProductIds: new Set<string>(),
      dodgyProductIds: new Set<string>(),
    })));
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
    stores: (byMonth.get(month.key) ?? []).map((store) => ({ ...store, real: store.realProductIds.size, dodgy: store.dodgyProductIds.size })),
  }));
}

/** Deal Stats — Watchlist summary and NZ-wide price trends. */
export default function MePage() {
  const { user, isAnonymousSession, loading: authLoading, openAuthSheet } = useAuth();
  const { isPremium, loading: subscriptionLoading, openSubscriptionPage } = useSubscriptions();
  const { products, loadingProducts, toggleStore, setDealFilter } = useSearch();
  const { savedProductIds, loadingSavedItems } = useWatchlist();
  const [isSavingsOpen, setIsSavingsOpen] = useState(false);
  const [activeStatsTab, setActiveStatsTab] = useState<"watchlist" | "trends">("watchlist");
  const deferredStatsTab = useDeferredValue(activeStatsTab);
  const [watchlistTopMode, setWatchlistTopMode] = useState<WatchlistTopMode>("most-often");
  const watchlistStats = useMemo(
    () => (activeStatsTab === "watchlist" ? buildWatchlistStats(products, savedProductIds, watchlistTopMode) : null),
    [activeStatsTab, products, savedProductIds, watchlistTopMode],
  );
  const watchlistStatsLocked = !subscriptionLoading && !isPremium;
  const watchlistProductCount = useMemo(
    () => (activeStatsTab === "watchlist" ? products.filter((product) => savedProductIds.has(product.id)).length : 0),
    [activeStatsTab, products, savedProductIds],
  );
  const nzTrends = useMemo(() => {
    if (activeStatsTab !== "trends" || deferredStatsTab !== "trends") return null;
    const currentStoreStats = buildCurrentStoreStats(products);
    const monthlyStats = buildMonthlyStats(products);
    const storeRankings = buildStoreRankings(products);
    const priceChangeStats = buildPriceChangeStats(products, STATS_STORES.map(({ key, label }) => ({ key, store: label })));
    const chronologicalMonthlySummaries: MonthlySummary[] = [...monthlyStats].reverse().map((month) => {
      const real = month.stores.reduce((sum, store) => sum + store.real, 0);
      const dodgy = month.stores.reduce((sum, store) => sum + store.dodgy, 0);
      return { key: month.key, label: month.label, real, dodgy, total: real + dodgy };
    });
    const monthlySpotlight = STATS_STORES.map(({ label }) => {
      const storeMonths = monthlyStats.flatMap((month) => month.stores.filter((store) => store.store === label));
      return { store: label, real: storeMonths.reduce((sum, month) => sum + month.real, 0), dodgy: storeMonths.reduce((sum, month) => sum + month.dodgy, 0) };
    }).sort((a, b) => b.real - a.real || b.dodgy - a.dodgy)[0];
    const busiestMonth = chronologicalMonthlySummaries.reduce<MonthlySummary | null>(
      (busiest, month) => (!busiest || month.total > busiest.total ? month : busiest),
      null,
    );
    return {
      currentStoreStats,
      maxCurrentSpecials: Math.max(1, ...currentStoreStats.map((store) => store.real + store.dodgy)),
      chronologicalMonthlySummaries,
      maxMonthlySpecials: Math.max(1, ...chronologicalMonthlySummaries.map((month) => month.total)),
      storeRankings,
      maxAverageDiscount: Math.max(1, ...storeRankings.map((store) => store.averageDiscount)),
      priceChangeStats,
      maxPriceChangeRate: Math.max(1, ...priceChangeStats.stores.map((store) => store.changeRatePct)),
      monthlySpotlight: monthlySpotlight?.real ? monthlySpotlight : null,
      busiestMonth,
      bestValueRanking: storeRankings.find((store) => store.realDeals > 0),
      mostPriceChangeStore: priceChangeStats.stores.find((store) => store.itemsTracked > 0),
    };
  }, [activeStatsTab, deferredStatsTab, products]);
  const openFilteredDeals = useCallback((storeKey: string, filter: Extract<DealFilter, "real" | "dodgy">) => {
    toggleStore("all");
    toggleStore(storeKey);
    setDealFilter(filter);
  }, [setDealFilter, toggleStore]);

  if (authLoading) {
    return <main className="flex flex-col gap-3 pb-8"><div className="flex flex-col gap-3 px-5 pt-4"><LoadingMascot loading /></div></main>;
  }

  if (!user) {
    const prompt = "Log in to see your Watchlist stats and estimated savings.";
    return (
      <main className="flex flex-col gap-4 pt-6 pb-8">
        <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
          <MascotImage src="/deal-stats-login.webp" darkSrc="/deal-stats-login-dark.webp" alt="An ascending savings chart with a check mark" width={288} height={263} sizes="144px" preload unoptimized className="mascot-wave h-auto w-full max-w-[9rem]" />
          <p className="max-w-xs px-4 text-sm font-bold text-stone-700">{prompt}</p>
          <button type="button" onClick={() => openAuthSheet(prompt)} className="dd-btn dd-btn-primary cursor-pointer">Log in or create an account</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 pb-8">
      <div className="dd-segmented-control relative mx-5 mt-4 flex h-11 items-center gap-0.5 rounded-full bg-white ring-1 ring-stone-200 shadow-sm shadow-black/5" role="tablist" aria-label="Deal stats views">
        {([["watchlist", "Your Stats"], ["trends", "NZ Trends"]] as const).map(([tab, label]) => {
          const isActive = activeStatsTab === tab;
          return <button key={tab} type="button" role="tab" id={`deal-stats-tab-${tab}`} aria-selected={isActive} aria-controls={`deal-stats-panel-${tab}`} onClick={() => setActiveStatsTab(tab)} className={`relative z-0 flex h-11 flex-1 cursor-pointer appearance-none items-center justify-center rounded-full px-3 py-1 text-center dd-type-control transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1 ${isActive ? "dd-segmented-control-active bg-ink-900 text-white shadow-sm" : "text-stone-600 hover:text-stone-900"}`}>{label}</button>;
        })}
      </div>
      {isAnonymousSession && <div className="mx-5 flex flex-col gap-1 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3"><p className="dd-type-meta dd-type-meta-strong text-amber-700">Test mode</p><p className="dd-type-secondary text-amber-700">You&rsquo;re using a test account. These stats are real, but you can&rsquo;t sign in to this account on another device.</p></div>}
      {activeStatsTab === "watchlist" ? (
        watchlistStats ? (
          <WatchlistStatsPanel loading={loadingProducts || loadingSavedItems} productCount={watchlistProductCount} stats={watchlistStats} isLocked={watchlistStatsLocked} isSavingsOpen={isSavingsOpen} onSavingsToggle={() => setIsSavingsOpen((open) => !open)} onSubscribe={openSubscriptionPage} topMode={watchlistTopMode} onTopModeChange={setWatchlistTopMode} />
        ) : (
          <section id="deal-stats-panel-watchlist" role="tabpanel" aria-labelledby="deal-stats-tab-watchlist" className="relative min-h-[180px]"><LoadingMascot loading /></section>
        )
      ) : (
        <section id="deal-stats-panel-trends" role="tabpanel" aria-labelledby="deal-stats-tab-trends" className="flex flex-col gap-6 px-5">
          <header className="pt-2 text-center"><MascotImage src="/deal-stats-calculating.webp" darkSrc="/deal-stats-calculating-dark.webp" alt="Dodgy Deal mascot calculating deal statistics" width={320} height={292} sizes="160px" priority unoptimized className="mascot-wave mx-auto mb-2 h-auto w-36 sm:w-40" /><h1 className="dd-type-section text-stone-900">NZ Trends in supermarket specials</h1></header>
          {nzTrends ? <NZTrendsPanel loading={loadingProducts} currentStoreStats={nzTrends.currentStoreStats} maxCurrentSpecials={nzTrends.maxCurrentSpecials} chronologicalMonthlySummaries={nzTrends.chronologicalMonthlySummaries} maxMonthlySpecials={nzTrends.maxMonthlySpecials} storeRankings={nzTrends.storeRankings} maxAverageDiscount={nzTrends.maxAverageDiscount} priceChangeStats={nzTrends.priceChangeStats} maxPriceChangeRate={nzTrends.maxPriceChangeRate} monthlySpotlight={nzTrends.monthlySpotlight} busiestMonth={nzTrends.busiestMonth} bestValueRanking={nzTrends.bestValueRanking} mostPriceChangeStore={nzTrends.mostPriceChangeStore} openFilteredDeals={openFilteredDeals} toggleStore={toggleStore} /> : <LoadingMascot loading />}
        </section>
      )}
    </main>
  );
}

function WatchlistStatsPanel({ loading, productCount, stats, isLocked, isSavingsOpen, onSavingsToggle, onSubscribe, topMode, onTopModeChange }: { loading: boolean; productCount: number; stats: WatchlistStats; isLocked: boolean; isSavingsOpen: boolean; onSavingsToggle: () => void; onSubscribe: () => void; topMode: WatchlistTopMode; onTopModeChange: (mode: WatchlistTopMode) => void }) {
  if (loading) return <section id="deal-stats-panel-watchlist" role="tabpanel" aria-labelledby="deal-stats-tab-watchlist" className="relative min-h-[180px]"><LoadingMascot loading /></section>;
  if (productCount === 0) return <section id="deal-stats-panel-watchlist" role="tabpanel" aria-labelledby="deal-stats-tab-watchlist" className="mx-5 flex flex-col items-center gap-3 rounded-3xl border border-stone-100 bg-white px-5 py-12 text-center shadow-xs"><h1 className="dd-type-section text-stone-900">Your Watchlist is empty</h1><p className="max-w-sm dd-type-secondary text-stone-500">Save products to compare their supermarket specials and price history here.</p><Link href="/lists" className="dd-btn dd-btn-primary">Open your Watchlist</Link></section>;
  const savingsHeadingPreviewIndex = stats.stores.length;
  const savingsItemsPreviewStart = savingsHeadingPreviewIndex + 1;
  const savingsActionPreviewIndex = savingsItemsPreviewStart + stats.savings.length;
  const topHeadingPreviewIndex = savingsActionPreviewIndex + 1;
  const topItemsPreviewStart = topHeadingPreviewIndex + 1;
  const previewItemCount = topItemsPreviewStart + Math.max(stats.topProducts.length, 1);
  const previewOpacity = (index: number) => isLocked ? getLockedPreviewOpacity(index, previewItemCount) : 1;
  const lockedPreviewClass = isLocked ? "pointer-events-none select-none" : "";
  return (
    <section id="deal-stats-panel-watchlist" role="tabpanel" aria-labelledby="deal-stats-tab-watchlist" className="flex flex-col gap-8">
      <section className="flex flex-col gap-5 px-5" aria-labelledby="watchlist-supermarket-heading">
        <h1 id="watchlist-supermarket-heading" className="dd-type-section text-stone-900">Your Watchlist by supermarket</h1>
        <p className="dd-type-secondary max-w-2xl text-stone-600">Compare the current Real Savers, Fair Deals and Dodgy Deals from your Watchlist at each supermarket. Verdicts are based on the last 90 days of price history.</p>
        {isLocked && <div className="mt-2"><StickySubscriptionCta label="Subscribe for full stats and insights" description="Unlock your stats and insights when you subscribe" onSubscribe={onSubscribe} /></div>}
        <div className={`rounded-xl ${lockedPreviewClass}`}><table className="w-full table-fixed border-collapse text-left" aria-label="Your Watchlist by supermarket for the last 90 days"><colgroup><col className="w-[18%]" /><col className="w-[27.33%]" /><col className="w-[27.33%]" /><col className="w-[27.33%]" /></colgroup><thead style={{ opacity: previewOpacity(0) }}><tr className="border-b border-stone-900"><th scope="col" className="px-0 py-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-stone-900"><span className="sr-only">Supermarket</span></th><th scope="col" className="px-1 py-2 text-center text-sm font-black uppercase leading-tight tracking-wide text-fair-700"><span className="sr-only">Real Savers</span><span aria-hidden="true">Real</span></th><th scope="col" className="px-1 py-2 text-center text-sm font-black uppercase leading-tight tracking-wide text-amber-500"><span className="sr-only">Fair Deals</span><span aria-hidden="true">Fair</span></th><th scope="col" className="px-1 py-2 text-center text-sm font-black uppercase leading-tight tracking-wide text-alert-600"><span className="sr-only">Dodgy Deals</span><span aria-hidden="true">Dodgy</span></th></tr></thead><tbody>{stats.stores.map((store, index) => <tr key={store.key} style={{ opacity: previewOpacity(index) }} className="border-b border-stone-200 last:border-b-0"><th scope="row" className="px-0 py-2"><StoreLogoBadge store={store.store} variant="compact" decorative /><span className="sr-only">{store.store}</span></th><td className="px-1 py-2 text-center text-xl font-black tabular-nums text-fair-600">{store.realSavers}</td><td className="px-1 py-2 text-center text-xl font-black tabular-nums text-amber-500">{store.fairDeals}</td><td className="px-1 py-2 text-center text-xl font-black tabular-nums text-alert-600">{store.dodgyDeals}</td></tr>)}</tbody></table></div>
      </section>
      <section className={`flex flex-col gap-5 px-5 ${lockedPreviewClass}`} aria-labelledby="estimated-savings-heading"><div style={{ opacity: previewOpacity(savingsHeadingPreviewIndex) }}><h2 id="estimated-savings-heading" className="dd-type-section text-stone-900">Estimated Savings</h2><p className="mt-2 dd-type-secondary text-stone-600">Compare your estimated savings at each supermarket based on current Watchlist specials.</p></div><div className="grid grid-cols-3 divide-x divide-stone-200/80 overflow-hidden rounded-2xl border border-stone-200/80 bg-fair-50 shadow-xs">{stats.savings.map((store, index) => <div key={store.key} style={{ opacity: previewOpacity(savingsItemsPreviewStart + index) }} className="flex min-w-0 flex-col items-center gap-2 px-2 py-5 text-center"><StoreLogoBadge store={store.store} variant="ranking" /><span className="sr-only">{store.store}</span><span className="text-xl font-black leading-none tabular-nums text-fair-800">{formatCurrency(store.amount)}</span></div>)}</div><div className="flex flex-col items-center" style={{ opacity: previewOpacity(savingsActionPreviewIndex) }}><button type="button" onClick={onSavingsToggle} disabled={isLocked} aria-expanded={isSavingsOpen} className="flex cursor-pointer items-center gap-2 dd-type-control text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 disabled:cursor-default"><span>See more info</span><ChevronDown className={`h-5 w-5 transition-transform ${isSavingsOpen ? "rotate-180" : ""}`} aria-hidden="true" /></button>{isSavingsOpen && <p className="mt-3 max-w-xl text-center dd-type-secondary text-stone-600">This is a one-unit estimate using the difference between each current special price and its reference price. It is not a record of checkout spending.</p>}</div></section>
      <section className={`flex flex-col gap-5 bg-fair-50 px-5 py-8 ${lockedPreviewClass}`} aria-labelledby="watchlist-top-heading"><h2 id="watchlist-top-heading" style={{ opacity: previewOpacity(topHeadingPreviewIndex) }} className="dd-type-section text-stone-900">Watchlist Top 3</h2><div style={{ opacity: previewOpacity(topHeadingPreviewIndex) }} className={`${isLocked ? "" : "sticky top-16 z-30"} -mx-5 flex gap-2 overflow-x-auto bg-fair-50 px-5 py-2 hide-scrollbar`} role="group" aria-label="Watchlist Top 3 ranking">{([["most-often", "Most often on special"], ["least-often", "Less often on special"], ["price-swings", "Biggest price swings"]] as const).map(([mode, label]) => { const selected = topMode === mode; return <button key={mode} type="button" disabled={isLocked} aria-pressed={selected} onClick={() => onTopModeChange(mode)} className={`flex-shrink-0 cursor-pointer rounded-full border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 disabled:cursor-default ${selected ? "border-ink-900 bg-ink-900 text-white" : "border-stone-200 bg-white text-stone-900 hover:bg-stone-50"}`}>{label}</button>; })}</div>{stats.topProducts.length > 0 ? <div className="flex flex-col gap-4">{stats.topProducts.map((item, index) => <div key={item.product.id} style={{ opacity: previewOpacity(topItemsPreviewStart + index) }}><WatchlistTopCard item={item} mode={topMode} rank={index + 1} isLocked={isLocked} /></div>)}</div> : <div style={{ opacity: previewOpacity(topItemsPreviewStart) }} className="rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-xs"><p className="dd-type-control text-stone-900">We need more price history to show your Top 3.</p><p className="mt-2 dd-type-secondary text-stone-600">Keep products on your Watchlist and check back as their 90-day history builds.</p></div>}</section>
    </section>
  );
}

function topCardAssessmentDeal(product: ProductCard): CurrentDeal | undefined {
  const deals = product.currentDeals.filter((deal) => deal.isOnSpecial === true);
  const candidates = deals.length > 0 ? deals : product.currentDeals;
  return candidates.reduce<CurrentDeal | undefined>((best, deal) => (!best || deal.price < best.price ? deal : best), undefined);
}

function WatchlistTopCard({ item, mode, rank, isLocked = false }: { item: WatchlistStats["topProducts"][number]; mode: WatchlistTopMode; rank: number; isLocked?: boolean }) {
  const summary = mode === "price-swings"
    ? item.totalPriceSwing > 0
      ? `Largest observed 90-day price range: ${formatCurrency(item.totalPriceSwing)}.`
      : `${item.totalPriceChanges} recorded price changes in the last 90 days.`
    : `${item.totalSpecialDays} ${item.totalSpecialDays === 1 ? "day" : "days"} on special in the last 90 days.`;
  const assessmentDeal = topCardAssessmentDeal(item.product);
  const cardClassName = "group block overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-xs transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2";
  const cardContent = (
    <>
      <div className="product-image-frame relative flex h-32 w-full items-center justify-center overflow-hidden bg-stone-50 p-3">
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
          <ProductImage src={item.product.image} alt={item.product.name} width={220} height={128} sizes="(max-width: 480px) 100vw, 440px" className="product-image-content h-full w-full object-contain" />
        </div>
        <span
          className="absolute left-0 top-0 h-14 w-14 bg-ink-600 font-display text-base font-black text-white [clip-path:polygon(0_0,100%_0,0_100%)]"
          aria-label={`Rank ${rank}`}
        >
          <span className="absolute left-1/3 top-1/3 -translate-x-1/2 -translate-y-1/2">{rank}</span>
        </span>
      </div>
      <div className="flex flex-col gap-3 bg-white px-3 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 min-w-0 font-display text-base font-bold leading-snug text-stone-900">{item.product.name}</h3>
          {assessmentDeal && !isLocked && <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-stone-400" aria-hidden="true" />}
        </div>
        <p className="text-xs font-bold leading-tight text-stone-800">{summary}</p>
        <div className="grid grid-cols-3 divide-x divide-stone-200 border-t border-stone-100 pt-3">
          {item.stores.map((store) => {
            const metric = topStoreMetric(store, mode);
            return (
              <div key={store.key} role="group" className="flex min-w-0 flex-col items-center gap-1.5 px-2 text-center first:pl-0 last:pr-0" aria-label={`${store.store}: ${metric.ariaLabel}`}>
                <StoreLogoBadge store={store.store} variant="ranking" decorative />
                <span className={`inline-flex max-w-full items-baseline justify-center whitespace-nowrap font-black leading-none tabular-nums text-stone-900 ${mode === "price-swings" ? "text-base sm:text-lg" : "text-lg sm:text-xl"}`}>
                  {metric.direction === "up" && <ArrowUp className="mr-0.5 h-3.5 w-3.5 shrink-0 text-alert-600" aria-hidden="true" />}
                  {metric.direction === "down" && <ArrowDown className="mr-0.5 h-3.5 w-3.5 shrink-0 text-fair-600" aria-hidden="true" />}
                  <span>{metric.value}</span>
                  {metric.unit && <span className="ml-0.5 text-[11px] font-extrabold tracking-tight text-stone-500">{metric.unit}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  return assessmentDeal && !isLocked ? (
    <Link href={`/deal/${encodeURIComponent(item.product.id)}/${encodeURIComponent(assessmentDeal.store)}`} aria-label={`View ${item.product.name} deal assessment at ${assessmentDeal.store}`} className={cardClassName}>
      {cardContent}
    </Link>
  ) : (
    <article className={cardClassName}>{cardContent}</article>
  );
}

function topStoreMetric(store: WatchlistStats["topProducts"][number]["stores"][number], mode: WatchlistTopMode): { value: string; unit?: "days"; direction: "up" | "down" | null; ariaLabel: string } {
  if (mode === "price-swings") {
    if (store.priceSwing === null) return { value: "—", direction: null, ariaLabel: "No 90-day price range available" };
    const range = formatCurrency(store.priceSwing);
    const directionLabel = store.priceSwingDirection === "up" ? "current price above the 90-day average" : store.priceSwingDirection === "down" ? "current price below the 90-day average" : "direction unavailable";
    return { value: range, direction: store.priceSwingDirection, ariaLabel: `${directionLabel}; 90-day price range ${range}` };
  }

  if (store.specialDays === null) return { value: "—", unit: "days", direction: null, ariaLabel: "No 90-day special-day history available" };
  return { value: String(store.specialDays), unit: "days", direction: null, ariaLabel: `${store.specialDays} days on special in the last 90 days` };
}

interface NZTrendsPanelProps {
  loading: boolean;
  currentStoreStats: CurrentStoreStats[];
  maxCurrentSpecials: number;
  chronologicalMonthlySummaries: MonthlySummary[];
  maxMonthlySpecials: number;
  storeRankings: StoreRanking[];
  maxAverageDiscount: number;
  priceChangeStats: ReturnType<typeof buildPriceChangeStats>;
  maxPriceChangeRate: number;
  monthlySpotlight: { store: string; real: number; dodgy: number } | null;
  busiestMonth: MonthlySummary | null;
  bestValueRanking: StoreRanking | undefined;
  mostPriceChangeStore: ReturnType<typeof buildPriceChangeStats>["stores"][number] | undefined;
  openFilteredDeals: (storeKey: string, filter: Extract<DealFilter, "real" | "dodgy">) => void;
  toggleStore: (storeKey: string) => void;
}

function NZTrendsPanel({ loading, currentStoreStats, maxCurrentSpecials, chronologicalMonthlySummaries, maxMonthlySpecials, storeRankings, maxAverageDiscount, priceChangeStats, maxPriceChangeRate, monthlySpotlight, busiestMonth, bestValueRanking, mostPriceChangeStore, openFilteredDeals, toggleStore }: NZTrendsPanelProps) {
  if (loading) return <LoadingMascot loading />;
  return <div className="flex flex-col gap-4">
    <div className="rounded-2xl bg-ink-900 p-5 text-white shadow-xs"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-200">NZ market pulse</p><p className="mt-1 text-sm font-semibold text-white/75">Current specials · 90-day view</p></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/70">Live</span></div><div className="mt-5 grid grid-cols-3 divide-x divide-white/15"><TrendInsightStat label="Most real savers" value={monthlySpotlight ? String(monthlySpotlight.real) : "—"} detail={monthlySpotlight?.store ?? "No data yet"} /><TrendInsightStat label="Best avg discount" value={bestValueRanking ? formatPercent(bestValueRanking.averageDiscount) : "—"} detail={bestValueRanking?.store ?? "No data yet"} /><TrendInsightStat label="Most price movement" value={mostPriceChangeStore ? `${mostPriceChangeStore.changeRatePct}%` : "—"} detail={mostPriceChangeStore?.store ?? "No data yet"} /></div></div>
    <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs"><div><h2 className="dd-type-section text-stone-900">Deal mix by supermarket</h2><p className="mt-1 dd-type-secondary text-stone-500">Real Savers and Dodgy Deals in the current 90-day view.</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 dd-type-meta text-stone-500"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fair-500" aria-hidden="true" />Real Saver</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-alert-500" aria-hidden="true" />Dodgy Deal</span></div></div><div className="flex flex-col gap-5">{currentStoreStats.map((store) => { const total = store.real + store.dodgy; const realWidth = total ? (store.real / maxCurrentSpecials) * 100 : 0; const dodgyWidth = total ? (store.dodgy / maxCurrentSpecials) * 100 : 0; return <div key={store.key}><div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="dd-type-control text-stone-800">{store.store}</span><span className="dd-type-meta font-bold tabular-nums text-stone-500">{total} specials</span></div><div role="img" aria-label={`${store.store}: ${store.real} Real Savers and ${store.dodgy} Dodgy Deals, ${total} specials total`} className="flex h-3 overflow-hidden rounded-full bg-stone-100"><span className="bg-fair-500 transition-[width]" style={{ width: `${realWidth}%` }} /><span className="bg-alert-500 transition-[width]" style={{ width: `${dodgyWidth}%` }} /></div><div className="mt-1.5 flex items-center gap-3 dd-type-meta"><Link href="/" onClick={() => openFilteredDeals(store.key, "real")} aria-label={`View ${store.real} Real Saver deals at ${store.store}`} className="font-bold text-fair-700 underline decoration-fair-300 underline-offset-2">{store.real} Real Savers</Link><Link href="/" onClick={() => openFilteredDeals(store.key, "dodgy")} aria-label={`View ${store.dodgy} Dodgy Deals at ${store.store}`} className="font-bold text-alert-700 underline decoration-alert-300 underline-offset-2">{store.dodgy} Dodgy</Link></div></div>; })}</div></div>
    <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs"><div><h2 className="dd-type-section text-stone-900">When did current specials start?</h2><p className="mt-1 dd-type-secondary text-stone-500">The month each current special was first recorded.</p></div>{busiestMonth?.total ? <p className="rounded-xl bg-ink-50 px-3.5 py-3 dd-type-secondary text-ink-900"><span className="font-bold">{busiestMonth.label}</span> has the most current specials still running ({busiestMonth.total}).</p> : <p className="rounded-xl bg-stone-50 px-3.5 py-3 dd-type-secondary text-stone-500">No current specials to chart yet.</p>}{busiestMonth?.total ? <div className="flex flex-col gap-5" role="list" aria-label="Current specials by start month">{chronologicalMonthlySummaries.map((month) => { const realWidth = (month.real / maxMonthlySpecials) * 100; const dodgyWidth = (month.dodgy / maxMonthlySpecials) * 100; return <div key={month.key} role="listitem"><div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="dd-type-control text-stone-800">{month.label}</span><span className="dd-type-meta font-bold tabular-nums text-stone-600">{month.total} {month.total === 1 ? "special" : "specials"}</span></div><div role="img" aria-label={`${month.label}: ${month.total} current specials, ${month.real} Real Savers and ${month.dodgy} Dodgy Deals`} className="flex h-3 overflow-hidden rounded-full bg-stone-100"><span className="bg-fair-500 transition-[width]" style={{ width: `${realWidth}%` }} /><span className="bg-alert-500 transition-[width]" style={{ width: `${dodgyWidth}%` }} /></div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 dd-type-meta"><span className="text-fair-700"><span className="font-bold tabular-nums">{month.real}</span> Real Savers</span><span className="text-alert-700"><span className="font-bold tabular-nums">{month.dodgy}</span> Dodgy Deals</span></div></div>; })}</div> : null}</div>
    <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs"><div><h2 className="dd-type-section text-stone-900">Best average discounts</h2><p className="mt-1 dd-type-secondary text-stone-500">Real Saver discounts by supermarket.</p></div>{bestValueRanking ? <div className="flex flex-col gap-4">{storeRankings.filter((store) => store.realDeals > 0).map((store, index) => <Link key={store.key} href="/" onClick={() => openFilteredDeals(store.key, "real")} aria-label={`Browse ${store.store} Real Saver deals averaging ${formatPercent(store.averageDiscount)}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2"><div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="dd-type-control text-stone-800"><span className="mr-1.5 text-stone-400">{index + 1}.</span>{store.store}</span><span className="text-base font-black tabular-nums text-fair-700">{formatPercent(store.averageDiscount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden="true"><div className="h-full rounded-full bg-fair-500 transition-[width]" style={{ width: `${(store.averageDiscount / maxAverageDiscount) * 100}%` }} /></div><div className="mt-1 flex justify-between gap-3 dd-type-meta text-stone-500"><span>{store.realDeals} {store.realDeals === 1 ? "deal" : "deals"}</span><span>{formatCurrency(store.totalSavings)} combined</span></div></Link>)}</div> : <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">No current Real Saver deals to rank yet.</p>}</div>
    <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-white p-5 shadow-xs"><div><h2 className="dd-type-section text-stone-900">Price movement</h2><p className="mt-1 dd-type-secondary text-stone-500">The share of tracked items with a recorded price change.</p></div>{mostPriceChangeStore ? <><div className="flex flex-col gap-4">{priceChangeStats.stores.filter((store) => store.itemsTracked > 0).map((store) => <div key={store.key}><div className="mb-1.5 flex items-baseline justify-between gap-3"><span className="dd-type-control text-stone-800">{store.store}</span><Link href="/" onClick={() => { toggleStore("all"); toggleStore(store.key); }} aria-label={`Browse current deals at ${store.store}`} className="dd-type-meta font-bold tabular-nums text-stone-600 underline decoration-stone-300 underline-offset-2">{store.changeRatePct}% changed</Link></div><div className="h-2 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={`${store.store}: ${store.changeRatePct}% of tracked items changed price`}><div className="dd-price-change-bar h-full rounded-full transition-[width]" style={{ width: `${(store.changeRatePct / maxPriceChangeRate) * 100}%` }} /></div><p className="mt-1 dd-type-meta text-stone-500">{store.itemsChanged} of {store.itemsTracked} items</p></div>)}</div><div className="border-t border-stone-100 pt-4"><p className="mb-2 dd-type-meta dd-type-meta-strong uppercase tracking-[0.08em] text-stone-500">Most changed items</p>{priceChangeStats.topProducts.length > 0 ? <div className="flex flex-col divide-y divide-stone-100">{priceChangeStats.topProducts.slice(0, 3).map((product, index) => <Link key={product.id} href={`/deal/${encodeURIComponent(product.id)}/${encodeURIComponent(product.store)}`} aria-label={`View ${product.name} deal assessment at ${product.store}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2"><span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-50 text-sm font-black tabular-nums text-ink-700">{index + 1}</span><span className="min-w-0 flex-1"><span className="block dd-type-meta truncate text-stone-500">{product.brand}</span><span className="block dd-type-control truncate text-stone-800">{product.name}</span><span className="block dd-type-meta text-stone-500">Across {product.storeCount} {product.storeCount === 1 ? "supermarket" : "supermarkets"}</span></span><span className="flex-shrink-0 text-right text-base font-black tabular-nums text-ink-700">{product.totalChanges} {product.totalChanges === 1 ? "change" : "changes"}</span></Link>)}</div> : <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">No price changes yet.</p>}</div></> : <p className="rounded-xl bg-stone-50 p-4 text-center dd-type-secondary text-stone-500">Not enough price history yet — we need two prices to compare.</p>}</div>
  </div>;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);
}

function TrendInsightStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0"><p className="min-h-8 text-[10px] font-bold leading-tight text-white/65">{label}</p><p className="mt-1 text-xl font-black leading-none tabular-nums text-white">{value}</p><p className="mt-1 truncate text-[10px] font-semibold leading-tight text-white/80">{detail}</p></div>;
}
