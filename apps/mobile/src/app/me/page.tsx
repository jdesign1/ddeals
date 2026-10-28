"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import type { CurrentDeal, ProductCard } from "@dodgey-deals/shared";
import LoadingMascot from "@/components/LoadingMascot";
import MascotImage from "@/components/MascotImage";
import ProductImage from "@/components/ProductImage";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import StickySubscriptionCta from "@/components/StickySubscriptionCta";
import { useAuth } from "@/lib/auth-context";
import type { DealFilter } from "@/lib/deal-filters";
import { getLockedPreviewOpacity } from "@/lib/locked-preview";
import { useSearch } from "@/lib/search-context";
import { useSubscriptions } from "@/lib/subscription-context";
import { useWatchlist } from "@/lib/watchlist-context";
import { buildMarketWatchStats } from "@/lib/market-watch";
import { buildWatchlistStats, type WatchlistStats, type WatchlistTopMode } from "@/lib/watchlist-stats";

const MarketWatchPanel = dynamic(() => import("@/components/MarketWatchPanel"), {
  ssr: false,
  loading: () => <div className="relative min-h-[280px]"><LoadingMascot loading /></div>,
});

/** Deal Stats — personal Watchlist insights and market-wide live value. */
export default function MePage() {
  const { user, isAnonymousSession, loading: authLoading, openAuthSheet } = useAuth();
  const { isPremium, loading: subscriptionLoading, openSubscriptionPage } = useSubscriptions();
  const { products, loadingProducts, openSearchForFilter } = useSearch();
  const { savedProductIds, loadingSavedItems } = useWatchlist();
  const [isSavingsOpen, setIsSavingsOpen] = useState(false);
  const [activeStatsTab, setActiveStatsTab] = useState<"watchlist" | "market">("watchlist");
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
  const marketWatchStats = useMemo(
    () => activeStatsTab === "market" && deferredStatsTab === "market" ? buildMarketWatchStats(products) : null,
    [activeStatsTab, deferredStatsTab, products],
  );
  const openMarketDeals = useCallback((filter: Extract<DealFilter, "real" | "dodgy">) => {
    openSearchForFilter(filter, { focus: false });
  }, [openSearchForFilter]);

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
        {([["watchlist", "Your Stats"], ["market", "Market Watch"]] as const).map(([tab, label]) => {
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
        <section id="deal-stats-panel-market" role="tabpanel" aria-labelledby="deal-stats-tab-market" className="flex flex-col gap-6 px-5">
          {marketWatchStats && !loadingProducts ? <MarketWatchPanel stats={marketWatchStats} onBrowse={openMarketDeals} /> : <LoadingMascot loading />}
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
  // Free members get a concise, fading preview rather than having to scroll
  // through an entire locked Top 3 section. Subscribers still see every
  // stat and product card below.
  const previewItemCount = isLocked
    ? savingsActionPreviewIndex + 1
    : topItemsPreviewStart + Math.max(stats.topProducts.length, 1);
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
      {!isLocked && <section className={`flex flex-col gap-5 bg-fair-50 px-5 py-8 ${lockedPreviewClass}`} aria-labelledby="watchlist-top-heading"><h2 id="watchlist-top-heading" style={{ opacity: previewOpacity(topHeadingPreviewIndex) }} className="dd-type-section text-stone-900">Watchlist Top 3</h2><div style={{ opacity: previewOpacity(topHeadingPreviewIndex) }} className={`${isLocked ? "" : "sticky top-16 z-30"} -mx-5 flex gap-2 overflow-x-auto bg-fair-50 px-5 py-2 hide-scrollbar`} role="group" aria-label="Watchlist Top 3 ranking">{([["most-often", "Most often on special"], ["least-often", "Less often on special"], ["price-swings", "Biggest price swings"]] as const).map(([mode, label]) => { const selected = topMode === mode; return <button key={mode} type="button" disabled={isLocked} aria-pressed={selected} onClick={() => onTopModeChange(mode)} className={`flex-shrink-0 cursor-pointer rounded-full border px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-2 disabled:cursor-default ${selected ? "border-ink-900 bg-ink-900 text-white" : "border-stone-200 bg-white text-stone-900 hover:bg-stone-50"}`}>{label}</button>; })}</div>{stats.topProducts.length > 0 ? <div className="flex flex-col gap-4">{stats.topProducts.map((item, index) => <div key={item.product.id} style={{ opacity: previewOpacity(topItemsPreviewStart + index) }}><WatchlistTopCard item={item} mode={topMode} rank={index + 1} isLocked={isLocked} /></div>)}</div> : <div style={{ opacity: previewOpacity(topItemsPreviewStart) }} className="rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-xs"><p className="dd-type-control text-stone-900">We need more price history to show your Top 3.</p><p className="mt-2 dd-type-secondary text-stone-600">Keep products on your Watchlist and check back as their 90-day history builds.</p></div>}</section>}
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);
}
