"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUp, Check, ScanBarcode, Search, Share2 } from "lucide-react";
import {
  loadLiveProducts,
  fetchUserLists,
  addItemToList,
  type ProductCard,
  type ListRow,
  getAssessmentVerdict,
  getStoreProductUrl,
  getRealAveragePrice,
  buildRankingList,
  buildVisibleRanking,
  buildBarChartData,
  findCheaperAlternatives,
  findDealForStore,
  normalizeStoreKey,
  DEAL_DETAIL_STORES_LIST,
  logDealCheck,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { useSearch } from "@/lib/search-context";
import { getSupabaseClient } from "@/lib/supabase-client";
import { getStoreLogoMeta } from "@/lib/store-meta";
import { usePageHeader } from "@/lib/header-context";
import PageLoader from "@/components/PageLoader";
import StoreCompareChart from "@/components/StoreCompareChart";
import FilterPill from "@/components/FilterPill";
import ErrorState from "@/components/ErrorState";

/**
 * Deal-assessment page — ported from Prototype/index.html's `DealModal`
 * (its "Check Deal" screen: reached by tapping a product card). See
 * `packages/shared/src/deal-detail.ts` for the ported data logic; this file
 * is the JSX/presentation half, copied class-for-class from the prototype
 * wherever this app's real routing/data model allows.
 *
 * Route: `/deal/[id]/[store]` — `id` is the match-group `ProductCard.id`
 * (same id `ProductListCard`/`DealCard` already key off), `store` is the
 * raw store name (`CurrentDeal.store`, e.g. "Woolworths NZ"), URL-encoded.
 * A real route rather than a modal overlay (Jay's ask, 2026-08-09) — the
 * prototype renders this as a modal because it has no router; this app
 * already has one, and every other screen here is a real route.
 *
 * Deliberate differences from the prototype, flagged rather than silently
 * dropped:
 *  - No bottom "Regular/Special min/max by store" pricing-stats table —
 *    needs real `price_history` data this app doesn't fetch anywhere
 *    (`ProductCard.priceHistory` is always `[]`, see data.ts). Faking it or
 *    silently reusing empty data would be exactly the kind of fabrication
 *    this app exists to catch, not commit. Flagged in project.md as a
 *    follow-up (would need a small targeted `price_history` fetch scoped to
 *    just this product/store, not a bigger architecture change).
 *  - The top "Search for supermarket products" bar opens the real
 *    full-screen search overlay via `useSearch()` (`lib/search-context.tsx`,
 *    2026-08-09) — it used to just navigate to Home (`/`) instead, back
 *    when the overlay was tightly coupled to Home's own local search
 *    state; that's no longer true now that search is global, so this was
 *    updated to match (caught in peer review as a stale spot the
 *    2026-08-09 global-search refactor missed). Its scan icon is its own
 *    independently-tappable button (`openScanner()`), not just a decorative
 *    `<span>` inside the search button.
 *  - "Add to List" is always shown (no `isTracked`-based hide) and opens
 *    the same real multi-list picker `AddToListButton` uses elsewhere in
 *    this app, not the prototype's single-boolean localStorage toggle,
 *    which has no real equivalent here (see AddToListButton.tsx's own
 *    header comment for the same reasoning).
 *  - The bottom tab bar is this app's real, persistent `BottomNav`
 *    (mounted globally in layout.tsx), not the prototype's own
 *    Check-deals/My-List/All-Checks/Deal-stats nav -- that exact tab set
 *    doesn't exist here, but as of 2026-08-11 "All Checks"/"Deal Stats"
 *    themselves DO (`/history`, `/me`), reached from Me rather than their
 *    own bottom-nav tabs (Jay's call, see project.md).
 *  - Every real, signed-in (non-fake-session) visit to this page logs a
 *    `deal_checks` row (2026-08-11) -- see the `logDealCheck` effect below
 *    and `packages/shared/src/deal-checks.ts`'s own header comment. Not in
 *    the prototype, which appends to a local `history` array on the same
 *    "Check Deals" tap instead (no backend at all there).
 */

const STORES_FOR_TOGGLE = DEAL_DETAIL_STORES_LIST;

/**
 * `getStoreLogoMeta(store).bg` gives a *background* class ("bg-emerald-600")
 * for the store badge. The prototype's DealModal also derives a *text*
 * color from it via `.bg.replace('bg-', 'text-')` for the "Lowest at X"
 * line -- safe there because it runs against Tailwind's browser CDN build
 * (compiles every possible utility on demand), but this app's real Tailwind
 * v4 build only generates classes that appear as literal strings somewhere
 * in source; a runtime string-replace produces a class name Tailwind never
 * saw and never generates CSS for. This literal map sidesteps that instead
 * of porting the bug.
 */
const STORE_TEXT_COLOR: Record<string, string> = {
  "bg-emerald-600": "text-emerald-600",
  "bg-amber-600": "text-amber-600",
  "bg-rose-600": "text-rose-600",
  "bg-green-600": "text-green-600",
  "bg-stone-600": "text-stone-600",
};

export default function DealAssessmentPage() {
  const params = useParams<{ id: string; store: string }>();
  const router = useRouter();
  const { user, isFakeSession } = useAuth();
  const { openSearch, openScanner, returnToSearch, resumeAfterDealBack, clearDealNavigationPending } = useSearch();

  // Clears the globally-mounted nav-transition `<PageLoader>` (see
  // `GlobalOverlays.tsx`/`search-context.tsx`'s `isDealNavigationPending`
  // doc comments) now that THIS page -- the thing that flag exists to cover
  // the wait for -- has actually mounted and is rendering its own local
  // `<PageLoader>` below (`products === null` is true on first render, same
  // tick as this effect gets scheduled), so there's no gap between the two
  // covers handing off. A no-op, safe to call even when this page was
  // reached some other way (Home, /specials, a direct link) and the flag
  // was never set true to begin with.
  useEffect(() => {
    clearDealNavigationPending();
  }, [clearDealNavigationPending]);

  const productId = decodeURIComponent(params.id);
  const dealStore = decodeURIComponent(params.store);

  const [products, setProducts] = useState<ProductCard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Same plain-counter retry pattern as search-context.tsx/specials/page.tsx
  // (2026-08-11) -- lets ErrorState's Try Again button re-run the fetch
  // below instead of leaving "Couldn't load this deal" as a dead end.
  const [retryTick, setRetryTick] = useState(0);
  // Resets `loadError` here (an event handler, not the effect body --
  // setting state synchronously inside the effect itself trips this
  // project's react-hooks/set-state-in-effect rule) before bumping
  // `retryTick`, so ErrorState swaps for PageLoader the instant Try Again is
  // tapped rather than waiting a frame for the effect to notice.
  const retry = useCallback(() => {
    setLoadError(null);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLiveProducts(supabaseConfig)
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load deal data");
      });
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  const product = useMemo(() => products?.find((p) => p.id === productId) ?? null, [products, productId]);
  const deal = useMemo(() => (product ? findDealForStore(product.currentDeals, dealStore) : undefined), [product, dealStore]);

  // Logs this view to `deal_checks` (2026-08-11, backs the ported "All
  // Checks"/"Deal Stats" screens -- see packages/shared/src/deal-checks.ts's
  // own header comment) the first time `product`/`deal` both resolve for a
  // real, signed-in session. `loggedCheckRef` guards against re-firing on
  // every subsequent render this effect's dependencies happen to touch
  // (e.g. `retry` re-fetching `products`) -- one page visit is one check,
  // not one check per re-render. Gated on `!isFakeSession` for the same
  // reason `lists/page.tsx`'s create/delete are (2026-08-11 session,
  // project.md) -- a fake session has no real Supabase JWT at all, so this
  // insert would just fail its RLS `WITH CHECK` silently-to-the-user every
  // time; skipped outright rather than let it throw into the void. Fire-
  // and-forget from this page's own point of view -- a failed write here
  // shouldn't block or degrade the deal-assessment UI itself, which is why
  // this doesn't feed into `loadError`/any visible state, just a console
  // warning if it fails.
  const loggedCheckRef = useRef(false);
  useEffect(() => {
    if (loggedCheckRef.current || !user || isFakeSession || !product || !deal) return;
    loggedCheckRef.current = true;
    logDealCheck(getSupabaseClient(), user.id, product.id, deal.store, deal.price, deal.originalPrice, deal.dealType).catch(
      (err: unknown) => {
        console.warn("logDealCheck failed:", err instanceof Error ? err.message : err);
      }
    );
  }, [user, isFakeSession, product, deal]);

  const [currentView, setCurrentView] = useState<"assessment" | "cheaper-alternatives">("assessment");
  const [selectedStores, setSelectedStores] = useState<string[]>(["all"]);

  // Reopens the full-screen search overlay instead of just falling through
  // to whatever route was underneath it (2026-08-10, per Jay's ask: "land
  // back on the search results page they began on, with any searched term
  // or results still in there") -- but only when `returnToSearch` (set by
  // `FullScreenSearch`'s own card tap, see search-context.tsx) actually
  // matches THIS deal, not a stale pending return left over from an
  // earlier, abandoned deal-page visit (e.g. one the user left via
  // BottomNav instead of this back button). `router.back()` still runs
  // either way, so the underlying route (Home, /specials, wherever) is
  // correctly restored for if/when the user closes search normally
  // afterwards via its own back arrow.
  const onBack = () => {
    if (returnToSearch && returnToSearch.productId === productId && returnToSearch.store === dealStore) {
      resumeAfterDealBack();
    }
    router.back();
  };
  const headerTitle =
    currentView === "cheaper-alternatives"
      ? "Cheaper Alternatives"
      : products === null
        ? "Loading…"
        : product
          ? product.name
          : "Deal not found";
  usePageHeader(headerTitle, currentView === "cheaper-alternatives" ? () => setCurrentView("assessment") : onBack);

  const rankingList = useMemo(() => (product ? buildRankingList(product) : []), [product]);
  const visibleRanking = useMemo(() => (product ? buildVisibleRanking(product, rankingList) : []), [product, rankingList]);
  const barChartData = useMemo(() => (product ? buildBarChartData(product) : []), [product]);
  const cheaperAlternatives = useMemo(
    () => (product && deal && products ? findCheaperAlternatives(product, products, deal.price, selectedStores) : []),
    [product, deal, products, selectedStores]
  );

  function handleStoreToggle(storeId: string) {
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
  }

  // `<PageLoader>` is rendered as a sibling on EVERY branch below
  // (`loading={products === null}`, true only on the "still fetching"
  // branch) rather than only inside the loading branch itself -- React
  // reconciles by the rendered tree's shape, not by which `return`
  // statement produced it, so as long as `<PageLoader>` sits at the same
  // position (first child of the returned fragment) across every branch,
  // it's treated as the SAME component instance updating props as
  // `products`/`product`/`deal` resolve, not unmounted+remounted. That's
  // what lets it play its exit fade (see its own doc comment) instead of
  // just vanishing the instant data arrives, without needing to collapse
  // this file's whole early-return structure into one branching variable.
  if (loadError) {
    return (
      <>
        <PageLoader loading={false} />
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <ErrorState message="Couldn't load this deal." detail={loadError} onRetry={retry} />
          <Link href="/" className="text-xs font-bold text-ink-600 underline">
            Back to Home
          </Link>
        </div>
      </>
    );
  }

  if (products === null) {
    return <PageLoader loading />;
  }

  if (!product || !deal) {
    return (
      <>
        <PageLoader loading={false} />
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm font-bold text-stone-700">This deal isn&rsquo;t on special right now.</p>
          <p className="text-xs text-stone-500">It may have ended, or the link is out of date.</p>
          <Link href="/" className="text-xs font-bold text-ink-600 underline">
            Back to Home
          </Link>
        </div>
      </>
    );
  }

  const verdict = getAssessmentVerdict(deal);
  const verdictColorClass =
    verdict === "Real Saver" ? "text-fair-800" : verdict === "Dodgy Deal" ? "text-alert-800" : "text-dodgy-900";
  const verdictBgClass =
    verdict === "Real Saver" ? "bg-fair-50" : verdict === "Dodgy Deal" ? "bg-alert-50" : "bg-dodgy-50";
  const verdictBorderClass =
    verdict === "Real Saver" ? "border-fair-200" : verdict === "Dodgy Deal" ? "border-alert-200" : "border-dodgy-200";
  const verdictButtonBorderClass =
    verdict === "Real Saver" ? "border-fair-700 text-fair-800" : verdict === "Dodgy Deal" ? "border-alert-700 text-alert-800" : "border-dodgy-700 text-dodgy-800";

  const cheapestStoreItem = rankingList[0];
  const cheapestAveragePrice = cheapestStoreItem ? getRealAveragePrice(product, cheapestStoreItem.store) : null;
  const cheapestDiscountPct =
    cheapestStoreItem && cheapestAveragePrice && cheapestAveragePrice > 0
      ? Math.round(((cheapestAveragePrice - cheapestStoreItem.price) / cheapestAveragePrice) * 100)
      : 0;

  const differing = barChartData.filter((d) => d.currentPrice !== d.averagePrice);

  if (currentView === "cheaper-alternatives") {
    return (
      <>
        <PageLoader loading={false} />
        <div className="flex-1 space-y-6 p-6 pb-24">
        <div className={`space-y-4 rounded-2xl border p-6 text-center shadow-xs ${verdictBorderClass} ${verdictBgClass}`}>
          <h2 className={`font-display text-2xl font-black tracking-tight ${verdictColorClass}`}>{verdict}</h2>
          <div className="mx-auto flex w-full max-w-sm items-center gap-4 rounded-xl border border-stone-200/60 bg-white p-4 text-left">
            <div className="h-16 w-16 flex-shrink-0 select-none overflow-hidden rounded-lg">
              <Image src={product.image} alt={product.name} width={64} height={64} unoptimized className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-sm font-extrabold leading-snug text-stone-900">{product.name}</h3>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-stone-400">
                {product.brand} · {product.unit}
              </p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-black text-stone-900">${deal.price.toFixed(2)}</span>
                <span className="text-[10px] font-semibold text-stone-500">at {dealStore}</span>
              </div>
            </div>
          </div>
        </div>

        <h2 className="font-display text-xl font-black tracking-tight text-stone-900">Cheaper Alternative Options</h2>

        <div className="flex flex-wrap gap-2">
          <FilterPill label="All" active={selectedStores.includes("all")} onClick={() => handleStoreToggle("all")} />
          {STORES_FOR_TOGGLE.map((s) => (
            <FilterPill
              key={s}
              label={s}
              active={!selectedStores.includes("all") && selectedStores.some((sel) => normalizeStoreKey(s).includes(sel))}
              onClick={() => handleStoreToggle(normalizeStoreKey(s))}
            />
          ))}
        </div>

        {cheaperAlternatives.length === 0 ? (
          <div className="space-y-2 rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-xs">
            <p className="text-sm font-bold text-stone-600">No cheaper alternatives found for the selected filter.</p>
            <p className="text-xs font-medium text-stone-400">Try choosing another supermarket or &ldquo;All Supermarkets&rdquo;.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {cheaperAlternatives.map(({ product: altProd, store: altStore, price: altPrice, saving }) => {
              const meta = getStoreLogoMeta(altStore);
              return (
                <div
                  key={`${altProd.id}-${altStore}`}
                  className="flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white px-5 pb-5 pt-7 shadow-xs transition-all hover:border-stone-300"
                >
                  <div className="flex gap-5">
                    <div className="flex h-28 w-28 flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-xl">
                      <Image src={altProd.image} alt={altProd.name} width={112} height={112} unoptimized className="h-full w-full object-contain" />
                    </div>
                    <div className="flex min-w-0 flex-grow flex-col justify-between py-1">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-ink-600">
                          {altProd.brand} · {altProd.unit}
                        </p>
                        <h3 className="mt-1 font-display text-base font-bold leading-snug text-stone-900">{altProd.name}</h3>
                        <span className="mt-2 inline-block rounded-md border border-fair-100/50 bg-fair-50 px-2.5 py-2 text-xs font-semibold tracking-wider text-fair-800">
                          Save <strong className="font-extrabold">${saving.toFixed(2)}</strong> compared to original item checked
                        </span>
                      </div>
                      <div className="mt-3.5 flex flex-wrap items-center gap-3">
                        <div className="flex flex-shrink-0 items-baseline gap-1 whitespace-nowrap">
                          <span className="text-[10px] font-bold tracking-wider text-stone-400">Lowest price:</span>
                          <span className="font-display text-base font-black text-stone-900">${altPrice.toFixed(2)}</span>
                        </div>
                        <span className={`select-none rounded-md px-2 py-1 text-[9px] font-black ${meta.bg} ${meta.text}`}>{meta.short}</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href={getStoreProductUrl(altStore, altProd.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center rounded-xl border border-stone-200 bg-white py-2.5 text-center text-[12px] font-semibold text-stone-700 transition-all hover:bg-stone-50"
                  >
                    Go to {altStore}
                  </a>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageLoader loading={false} />
      <div className="flex flex-col">
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center rounded-full border border-stone-300 bg-white py-2.5 pl-5 pr-2 text-sm font-medium text-stone-400">
        <button
          type="button"
          onClick={openSearch}
          className="flex flex-1 cursor-pointer items-center text-left"
        >
          <Search className="mr-3 h-5 w-5 flex-shrink-0 text-stone-400" aria-hidden="true" />
          <span className="flex-1">Search for supermarket products</span>
        </button>
        <button
          type="button"
          onClick={openScanner}
          title="Scan a barcode"
          aria-label="Scan a barcode"
          className="ml-2 flex flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-ink-100 bg-white p-2.5 text-ink-600 transition-colors hover:bg-stone-50"
        >
          <ScanBarcode className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className={`space-y-5 rounded-2xl border p-5 text-left shadow-xs ${verdictBorderClass} ${verdictBgClass}`}>
        <div className="flex items-center justify-between">
          <h2 className={`font-display text-xl font-black tracking-tight ${verdictColorClass}`}>{verdict}</h2>
          <button
            type="button"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: product.name, url: window.location.href }).catch(() => {});
              } else if (navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href).catch(() => {});
              }
            }}
            aria-label="Share"
            className="text-stone-500 transition-colors hover:text-stone-700"
          >
            <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-start gap-4">
          <div className="h-24 w-24 flex-shrink-0 select-none overflow-hidden rounded-lg bg-white">
            <Image src={product.image} alt={product.name} width={96} height={96} unoptimized className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-extrabold leading-snug text-stone-900">{product.name}</h3>
            <p className="mt-0.5 text-sm font-bold uppercase tracking-wider text-stone-400">{product.unit}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-black text-stone-900">${deal.price.toFixed(2)}</span>
              <span className="text-sm font-bold text-stone-500">ea</span>
            </div>
            <p
              className={`mt-0.5 text-sm font-bold ${
                STORE_TEXT_COLOR[getStoreLogoMeta(verdict === "Dodgy Deal" ? dealStore : (cheapestStoreItem?.store ?? dealStore)).bg] ||
                "text-stone-600"
              }`}
            >
              {verdict === "Dodgy Deal" ? `at ${dealStore}` : `Lowest at ${cheapestStoreItem?.store ?? dealStore}`}
            </p>
          </div>
        </div>

        <div>
          {verdict === "Dodgy Deal" ? (
            <>
              <h4 className="mb-1 text-base font-black text-stone-900">Dodgy discount special</h4>
              <p className="text-sm leading-relaxed text-stone-600">
                The lowest genuine price is offered by {cheapestStoreItem?.store}. However, this price is{" "}
                {cheapestDiscountPct === 0 ? (
                  "equal to a recent special price"
                ) : (
                  <>
                    {Math.abs(cheapestDiscountPct)}% {cheapestDiscountPct > 0 ? "lower" : "higher"} than a recent special price
                  </>
                )}
                {cheapestAveragePrice != null && (
                  <>
                    {" "}
                    <strong className="font-extrabold text-stone-800">${cheapestAveragePrice.toFixed(2)}</strong>
                  </>
                )}
                .
              </p>
            </>
          ) : verdict === "Fair Deal" ? (
            <>
              <h4 className="mb-1 text-base font-black text-stone-900">
                {cheapestDiscountPct === 0 ? "No real savings" : `${Math.abs(cheapestDiscountPct)}% off the recent normal price`}
              </h4>
              <p className="text-sm leading-relaxed text-stone-600">
                {cheapestDiscountPct === 0 ? (
                  <>This on special price is about the same as a recent special price</>
                ) : (
                  <>
                    This price is {Math.abs(cheapestDiscountPct)}% lower than a recent special price
                  </>
                )}
                {cheapestAveragePrice != null && (
                  <>
                    {" "}
                    <strong className="font-extrabold text-stone-800">${cheapestAveragePrice.toFixed(2)}</strong>
                  </>
                )}
                {cheapestDiscountPct === 0 ? "." : ` at ${cheapestStoreItem?.store}.`}
              </p>
            </>
          ) : (
            <>
              <h4 className="mb-1 text-base font-black text-stone-900">{cheapestDiscountPct}% off the recent normal price</h4>
              <p className="text-sm leading-relaxed text-stone-600">
                This price is a genuine saving compared to the recent normal price at {cheapestStoreItem?.store}.
              </p>
            </>
          )}
        </div>

        {cheapestStoreItem && (
          <a
            href={getStoreProductUrl(cheapestStoreItem.store, product.name)}
            target="_blank"
            rel="noopener noreferrer"
            className={`block w-full rounded-full border py-3 px-4 text-center text-[13px] font-black transition-all hover:bg-white/50 ${verdictButtonBorderClass}`}
          >
            View at {cheapestStoreItem.store}
          </a>
        )}

        {visibleRanking.length >= 2 && (
          <div>
            <h4 className={`mb-1 border-b pb-2 text-sm font-black text-stone-900 ${verdictBorderClass}`}>Price ranking</h4>
            <div>
              {visibleRanking.map((item, idx, arr) => {
                const dealForStore = findDealForStore(product.currentDeals, item.store);
                const isOnSale = dealForStore ? dealForStore.isOnSpecial !== false : false;
                const isCheapest = idx === 0;
                return (
                  <div
                    key={item.store}
                    className={`flex items-center gap-2 py-2.5 ${idx < arr.length - 1 ? `border-b ${verdictBorderClass}` : ""}`}
                  >
                    {isCheapest ? (
                      <Check className="h-4 w-4 flex-shrink-0 text-fair-600" strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <ArrowUp className="h-4 w-4 flex-shrink-0 text-stone-400" strokeWidth={2.5} aria-hidden="true" />
                    )}
                    <span className={`flex flex-1 items-center gap-1.5 text-sm ${isCheapest ? "font-extrabold text-fair-700" : "font-semibold text-stone-600"}`}>
                      {item.store}
                      {isCheapest && (
                        <span className="rounded-[4px] bg-fair-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Best</span>
                      )}
                    </span>
                    <span className={`w-24 text-center text-xs ${isOnSale ? "italic font-bold" : "font-semibold"} ${isCheapest ? "text-fair-700" : "text-stone-500"}`}>
                      {isOnSale ? "Special" : "Regular price"}
                    </span>
                    <span className={`text-right text-sm ${isCheapest ? "font-bold text-fair-700" : "font-semibold text-stone-600"}`}>${item.price.toFixed(2)} ea</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {cheaperAlternatives.length > 0 && (
          <div>
            <h4 className="mb-1 text-sm font-black text-stone-900">Cheaper alternatives available</h4>
            <p className="mb-3 text-sm text-stone-600">See other cheaper alternatives on special</p>
            <button
              onClick={() => setCurrentView("cheaper-alternatives")}
              className={`flex w-full items-center justify-center gap-2 rounded-full border py-3 px-4 text-center text-[13px] font-black transition-all hover:bg-white/50 ${verdictButtonBorderClass}`}
            >
              <span>See cheaper options</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fair-600 text-[11px] font-black text-white">
                {cheaperAlternatives.length}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="font-display text-lg font-black tracking-tight text-stone-900">Current Special vs Recent prices by store</h4>
          <div className="mt-1 space-y-0.5 text-xs leading-relaxed text-stone-500">
            <p>Dark = recent average price. Green = current price.</p>
            <p>Green above dark means current price is higher than average.</p>
            <p>Green within dark means current price is lower than average.</p>
          </div>
          {differing.length === 0 ? (
            <p className="mt-2 text-xs font-bold text-stone-600">All shown supermarkets are currently priced at their recent average.</p>
          ) : (
            <p className="mt-2 text-xs font-bold text-fair-700">
              {differing.length} of {barChartData.length} supermarket{barChartData.length === 1 ? "" : "s"} currently{" "}
              {differing.length === 1 ? "differs" : "differ"} from its recent average price.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-end gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-ink-600">
              <span className="h-2 w-2 rounded-full bg-[#171710]" />
              <span>Average Price</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-fair-700">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
              <span>Current special price</span>
            </div>
          </div>
          <StoreCompareChart rows={barChartData} />
        </div>
      </div>
    </div>

      <AddToListBar productId={product.id} isLoggedIn={!!user} />
    </div>
    </>
  );
}

/**
 * Full-width sticky "Add to List" bar — same visual slot as the prototype's
 * bottom bar, wired to this app's real multi-list picker (fetchUserLists/
 * addItemToList, same calls AddToListButton.tsx uses) instead of the
 * prototype's single-boolean `isTracked` toggle, which has no equivalent
 * here. Always shown (no "already tracked" hide) since this app has no
 * single tracked/not-tracked flag to hide it on.
 */
function AddToListBar({ productId, isLoggedIn }: { productId: string; isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setOpen((wasOpen) => !wasOpen);
    if (lists === null && isLoggedIn) {
      try {
        setLists(await fetchUserLists(getSupabaseClient()));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lists");
      }
    }
  }

  async function handleAdd(listId: string) {
    try {
      await addItemToList(getSupabaseClient(), listId, productId);
      setAddedTo((prev) => new Set(prev).add(listId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  return (
    <div className="sticky bottom-0 z-30 border-t border-stone-100 bg-white p-4.5">
      {open && (
        <div className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
          {!isLoggedIn ? (
            <Link href="/lists" className="block rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-700">
              Log in to save items
            </Link>
          ) : lists === null ? (
            <p className="px-2 py-1.5 text-xs text-stone-500">Loading…</p>
          ) : lists.length === 0 ? (
            <Link href="/lists" className="block rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-700">
              Create a list first
            </Link>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    onClick={() => handleAdd(list.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    <span className="truncate">{list.name}</span>
                    {addedTo.has(list.id) && <Check className="h-3.5 w-3.5 shrink-0 text-ink-600" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="px-2 pt-1 text-[10px] text-alert-600">{error}</p>}
        </div>
      )}
      <button
        onClick={handleOpen}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-900 bg-stone-900 py-4 px-6 text-xs font-black uppercase tracking-widest text-white shadow-md transition-all hover:border-ink-600 hover:bg-ink-600"
      >
        Add to List
      </button>
    </div>
  );
}
