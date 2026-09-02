"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Share2, X } from "lucide-react";
import {
  loadLiveProducts,
  type ProductCard,
  getAssessmentVerdict,
  getStoreProductUrl,
  getRealAveragePrice,
  buildRankingList,
  buildVisibleRanking,
  buildBarChartData,
  findCheaperAlternatives,
  findDealForStore,
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
import ErrorState from "@/components/ErrorState";
import AddToListButton from "@/components/AddToListButton";

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
 *  - No search bar on this page (2026-08-17, per Jay: "Remove the search
 *    bar on the deal assessment pages"). This page briefly rendered the
 *    real, shared `SearchBar.tsx` component earlier the same day (replacing
 *    an old hand-rolled lookalike -- see project.md for that history), but
 *    Jay's next ask removed it outright rather than reverting to the
 *    lookalike. `useSearch()` is still imported/used below for the
 *    "return to search results after Back" behaviour (`returnToSearch`/
 *    `resumeAfterDealBack`), which is unrelated to rendering a search bar
 *    on this page itself.
 *  - "Add to List" is always shown (no `isTracked`-based hide) and IS
 *    literally `AddToListButton.tsx` (imported, not re-implemented) --
 *    originally this page ported the prototype's own full-width sticky
 *    bottom bar instead, wired to the same multi-list picker via a
 *    bespoke local `AddToListBar` function; replaced 2026-08-12, per
 *    Jay's ask, with the shared component sitting inline next to Share,
 *    since Jay's target look (small circle, "+" icon) was now identical
 *    to what that shared component already renders everywhere else.
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
  const { user } = useAuth();
  const { returnToSearch, resumeAfterDealBack, clearDealNavigationPending } = useSearch();

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
  // signed-in session. `loggedCheckRef` guards against re-firing on every
  // subsequent render this effect's dependencies happen to touch (e.g.
  // `retry` re-fetching `products`) -- one page visit is one check, not one
  // check per re-render. No longer gated on the dev test account
  // (2026-08-13) -- that account is a real Supabase anonymous sign-in now
  // (see auth-context.tsx's own doc comment), with a real JWT that passes
  // this table's RLS `WITH CHECK` exactly like a normal signed-in user, so
  // the old `isFakeSession` skip (needed back when that account had no real
  // session to insert with at all) no longer applies -- same reasoning as
  // `lists/page.tsx`'s create/delete guards coming out entirely rather than
  // just being renamed. Fire-and-forget from this page's own point of view
  // -- a failed write here shouldn't block or degrade the deal-assessment
  // UI itself, which is why this doesn't feed into `loadError`/any visible
  // state, just a console warning if it fails.
  const loggedCheckRef = useRef(false);
  useEffect(() => {
    if (loggedCheckRef.current || !user || !product || !deal) return;
    loggedCheckRef.current = true;
    logDealCheck(getSupabaseClient(), user.id, product.id, deal.store, deal.price, deal.originalPrice, deal.dealType).catch(
      (err: unknown) => {
        console.warn("logDealCheck failed:", err instanceof Error ? err.message : err);
      }
    );
  }, [user, product, deal]);

  // "cheaper-alternatives" now opens a bottom sheet OVER the assessment
  // view (2026-08-12, per Jay's ask to turn this into a bottom sheet
  // instead of the full page-swap it used to be) rather than replacing
  // it -- see the `<AnimatePresence>` block near the end of this
  // component's main return for the sheet itself. `currentView` keeps its
  // name/type unchanged so the "See cheaper options" button below and
  // this state's own meaning ("which view is the user in") don't need
  // touching, just how it's rendered.
  const [currentView, setCurrentView] = useState<"assessment" | "cheaper-alternatives">("assessment");

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
  // No longer branches on `currentView` (2026-08-12) -- now that "cheaper
  // alternatives" is a bottom sheet layered over this view rather than a
  // second full-page view, the global header stays on this page's own
  // title/back button the whole time; the sheet gets its own inline close
  // button instead (see the sheet itself, near the end of this return).
  const headerTitle = products === null ? "Loading…" : product ? product.name : "Deal not found";
  usePageHeader(headerTitle, onBack);

  const rankingList = useMemo(() => (product ? buildRankingList(product) : []), [product]);
  const visibleRanking = useMemo(() => (product ? buildVisibleRanking(product, rankingList) : []), [product, rankingList]);
  const barChartData = useMemo(() => (product ? buildBarChartData(product) : []), [product]);
  // Always "all" stores now (2026-08-12) -- the supermarket filter pills
  // that used to let Jay narrow this down (`selectedStores` state +
  // `handleStoreToggle`) were removed per his ask ("don't display
  // supermarket pills on the cheaper alternatives page"), so there's no UI
  // left that ever changes this; passing the literal array inline instead
  // of keeping a never-updated state variable around.
  const cheaperAlternatives = useMemo(
    () => (product && deal && products ? findCheaperAlternatives(product, products, deal.price, ["all"]) : []),
    [product, deal, products]
  );

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
          <Link href="/" className="text-[13px] leading-4 font-bold text-ink-600 underline">
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
          <p className="text-[13px] leading-4 text-stone-500">It may have ended, or the link is out of date.</p>
          <Link href="/" className="text-[13px] leading-4 font-bold text-ink-600 underline">
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

  return (
    <>
      <PageLoader loading={false} />
      {/* No search bar on this page (2026-08-17, per Jay's ask, same day
          as the change above that had briefly added the real `SearchBar`
          component here -- see this file's header comment).

          `p-6` (uniform 24px on all sides) -> `px-6 pb-6 pt-3` (2026-08-17,
          later same day, Jay: "the top deal card has 24px top padding make
          it 12px") -- shrinks just the TOP inset above the verdict card
          below to 12px, leaving the side/bottom padding at the original
          24px; not touching the verdict card's own `p-5` padding, which
          is a separate, smaller (20px) value this ask didn't mention. */}
    <div className="flex-1 space-y-6 px-6 pb-6 pt-3">

      <div className={`space-y-5 rounded-2xl border p-5 text-left shadow-xs ${verdictBorderClass} ${verdictBgClass}`}>
        <div className="flex items-center justify-between">
          <h2 className={`font-display text-xl font-black tracking-tight ${verdictColorClass}`}>{verdict}</h2>
          {/* Add-to-list + Share, side by side (2026-08-12, per Jay's ask
              to replace the old full-width sticky "Add to List" bar at the
              bottom of this page with a small circle button next to
              Share). Reuses the real `AddToListButton` component
              (`ProductListCard`/`DealCard`'s own "+" button, just with
              `containerClassName="relative"` instead of its card default
              of `absolute right-2 top-2` -- see that component's own doc
              comment) rather than this page's old bespoke `AddToListBar`
              function, which duplicated the same fetchUserLists/
              addItemToList logic for no real reason once this button
              needed the exact same look anyway. */}
          <div className="flex items-center gap-3">
            {/* Left as a bare icon, no fill added for the 2026-08-17 "white
                fill" ask -- unlike the bordered-pill buttons below and
                `AddToListButton`'s circle, this one was never a filled
                shape to begin with (no border/background at all, same
                plain-icon treatment as this file's own sheet close
                buttons), so giving it a white circle would be adding a
                new shape Jay didn't ask for rather than fixing an
                existing fill. Flagged in case that's wanted as a
                follow-up, not assumed. */}
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
            {/* `bg-white` added (2026-08-17, Jay: "Add to list button
                should have a white fill on the deal assessment page") --
                this override previously dropped both the `bg-white` and
                the `shadow` that `AddToListButton.tsx`'s own default
                `buttonClassName` carries (its doc comment: "Defaults to
                the original solid `bg-white` circle every card usage
                still gets"), leaving just the border + icon on a
                transparent fill, so the verdict card's own tinted
                background (`bg-fair-50`/`bg-alert-50`/`bg-dodgy-50`)
                showed straight through the circle instead of a solid
                white button. Only `bg-white` added, not the default's
                `shadow` too -- Jay's ask was specifically "white fill",
                and the border-only look (no shadow) was presumably
                intentional here to sit flush next to the plain `Share`
                icon beside it rather than card-style elevated; flagged in
                case the shadow was wanted too as a follow-up. */}
            <AddToListButton
              productId={product.id}
              containerClassName="relative"
              buttonClassName="flex h-7 w-7 items-center justify-center rounded-full border border-stone-900 bg-white text-stone-900"
            />
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="h-24 w-24 flex-shrink-0 select-none overflow-hidden rounded-lg bg-white">
            <Image src={product.image} alt={product.name} width={96} height={96} unoptimized className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-extrabold leading-snug text-stone-900">{product.name}</h3>
            <p className="mt-0.5 text-sm font-bold tracking-wider text-stone-500">{product.unit}</p>
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

        {/* `bg-white` added to both action buttons below (2026-08-17,
            Jay: "buttons on the deal assessment page should have a white
            fill") -- previously transparent at rest (just a
            `verdictButtonBorderClass`-coloured border sitting directly on
            the verdict card's own tinted `${verdictBgClass}` background,
            e.g. `bg-fair-50`), only turning `hover:bg-white/50` on
            hover/tap. `hover:bg-white/50` swapped for `hover:bg-stone-50`
            on both -- with a solid white base already, the old hover
            class would have made hovering read as LESS white (50%
            opacity back down to the tinted card colour showing through),
            the opposite of the emphasis a hover state should give;
            `hover:bg-stone-50` is the same subtle-grey hover already used
            elsewhere in this app (e.g. the list-picker rows in
            `AddToListButton.tsx`) for a filled element. */}
        {cheapestStoreItem && (
          <a
            href={getStoreProductUrl(cheapestStoreItem.store, product.name)}
            target="_blank"
            rel="noopener noreferrer"
            className={`block w-full rounded-full border bg-white py-3 px-4 text-center text-[13px] leading-4 font-black transition-all hover:bg-stone-50 ${verdictButtonBorderClass}`}
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
                        <span className="rounded-[4px] bg-fair-600 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white">Best</span>
                      )}
                    </span>
                    <span className={`w-24 text-center text-[13px] leading-4 ${isOnSale ? "italic font-bold" : "font-semibold"} ${isCheapest ? "text-fair-700" : "text-stone-500"}`}>
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
              className={`flex w-full items-center justify-center gap-2 rounded-full border bg-white py-3 px-4 text-center text-[13px] leading-4 font-black transition-all hover:bg-stone-50 ${verdictButtonBorderClass}`}
            >
              <span>See cheaper options</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fair-600 text-[12px] font-black text-white">
                {cheaperAlternatives.length}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="font-display text-lg font-black tracking-tight text-stone-900">Current Special vs Recent prices by store</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
            Compares the current price at each store to its recent average
            price. Green means cheaper than usual, red means pricier.
          </p>
          {differing.length === 0 ? (
            <p className="mt-2 text-[13px] leading-4 font-bold text-stone-600">All shown supermarkets are currently priced at their recent average.</p>
          ) : (
            <p className="mt-2 text-[13px] leading-4 font-bold text-fair-700">
              {differing.length} of {barChartData.length} supermarket{barChartData.length === 1 ? "" : "s"} currently{" "}
              {differing.length === 1 ? "differs" : "differ"} from its recent average price.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-1.5 text-[13px] leading-4 font-bold text-ink-600">
              <span className="h-2 w-2 rounded-full bg-ink-600" />
              <span>Recent average</span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px] leading-4 font-bold text-fair-700">
              <span className="h-2 w-2 rounded-full bg-fair-600" />
              <span>Cheaper than usual</span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px] leading-4 font-bold text-alert-700">
              <span className="h-2 w-2 rounded-full bg-alert-600" />
              <span>Pricier than usual</span>
            </div>
          </div>
          <StoreCompareChart rows={barChartData} />
        </div>
      </div>
    </div>

    {/* "Cheaper Alternative Options" bottom sheet (2026-08-12, per Jay's
        ask to turn this from a full page-swap into a bottom sheet) --
        same scrim + slide-up-panel pattern `ScannerModal.tsx` already
        established (motion/AnimatePresence, spring transition, rounded-t
        panel with its own header + close button), rather than inventing a
        second pattern. Two deliberate differences from that precedent,
        both flagged rather than silently copied wrong:
         - `max-w-[480px]` on both the scrim and panel (not `ScannerModal`'s
           own `max-w-md`/448px with no cap on its scrim at all) -- matches
           the more precise, already-fixed desktop-width-cap treatment
           `FullScreenSearch.tsx`'s overlay and category sheet got in an
           earlier session, rather than reproducing `ScannerModal`'s own
           still-flagged (not yet fixed) gap.
         - Content is this same component's own `verdict`/`product`/`deal`/
           `cheaperAlternatives` (already computed above for the main
           assessment view), not props on a separate component -- this
           sheet only ever needs this one page's own state, so there's no
           reuse case that would justify extracting it.
        Per Jay's other asks about this same content: the supermarket
        filter pills are gone entirely -- `cheaperAlternatives` itself is
        now always computed across all stores (see that `useMemo` above),
        so removing the pills didn't leave a filter that's silently stuck
        on one store, it just removed the (now pointless) control for
        changing it. The empty-state copy was also reworded since it used
        to reference "the selected filter," which no longer exists. The
        verdict title itself (originally `text-2xl` centered, then
        `text-xl text-left` to match the main assessment view's own
        heading) was removed outright 2026-08-17, per Jay's "remove the
        real saver text ... keeping the green card" -- see this section's
        own doc comment further down for the current reasoning; superseded,
        not layered on top of, the text-align/size history above. */}
    <AnimatePresence>
      {currentView === "cheaper-alternatives" && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCurrentView("assessment")}
            className="fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/60 backdrop-blur-xs"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed bottom-0 inset-x-0 z-[51] mx-auto flex min-h-[45vh] max-h-[85dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl border-x border-t border-stone-200 bg-white shadow-2xl"
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-stone-200 px-6 py-4">
              {/* "Cheaper alternative options" -> "Cheaper options on
                  special" (2026-08-17, Jay's ask). */}
              <h3 className="font-display text-base font-bold tracking-wider text-stone-900">
                Cheaper options on special
              </h3>
              <button
                onClick={() => setCurrentView("assessment")}
                aria-label="Close"
                className="rounded-full p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Verdict heading (`{verdict}`, e.g. "Real Saver") removed
                  (2026-08-17, Jay: "remove the real saver text ... keeping
                  the green card") -- the card's own colored border/fill
                  (`verdictBorderClass`/`verdictBgClass`) already carries the
                  verdict visually, this dropped just the redundant text
                  label, not the card itself. Product image `h-16 w-16`
                  (64px) -> `h-24 w-24` (96px), same ask, "make the product
                  image larger" -- 1.5x bigger, still visibly smaller than
                  the alternative cards' own `h-28 w-28` (112px) below so
                  this reads as the smaller "here's what you're comparing
                  against" summary, not itself one of the alternatives. */}
              <div className={`space-y-4 rounded-2xl border p-6 text-left shadow-xs ${verdictBorderClass} ${verdictBgClass}`}>
                <div className="mx-auto flex w-full max-w-sm items-center gap-4 rounded-xl border border-stone-200/60 bg-white p-4 text-left">
                  <div className="h-24 w-24 flex-shrink-0 select-none overflow-hidden rounded-lg">
                    <Image src={product.image} alt={product.name} width={96} height={96} unoptimized className="h-full w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-extrabold leading-snug text-stone-900">{product.name}</h3>
                    <p className="mt-0.5 text-[13px] leading-4 font-bold tracking-wider text-stone-500">
                      {product.brand
                        ? product.brand.charAt(0).toUpperCase() + product.brand.slice(1).toLowerCase()
                        : product.brand}{" "}
                      · {product.unit}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-black text-stone-900">${deal.price.toFixed(2)}</span>
                      <span className="text-[11px] font-semibold text-stone-500">at {dealStore}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Horizontal rule + "Similar deals" title (2026-08-17, Jay's
                  ask) between the top summary card and the alternatives
                  list below -- a plain `<hr>` (this app has no existing
                  divider primitive to reuse here) styled to the same
                  `border-stone-200` every other hairline border in this
                  sheet already uses (the sheet's own header `border-b`,
                  each alternative card's own `border`). Heading styled to
                  match the "Cheaper alternatives available" section title
                  on the main assessment view just above this sheet
                  (`text-sm font-black text-stone-900`), not this sheet's
                  own larger `font-display text-base` header, since this is
                  a sub-section label within the sheet, not the sheet's own
                  title. */}
              <hr className="border-stone-200" />
              <h3 className="text-sm font-black text-stone-900">Similar deals</h3>

              {cheaperAlternatives.length === 0 ? (
                <div className="space-y-2 rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-xs">
                  <p className="text-sm font-bold text-stone-600">No cheaper alternatives found for this item right now.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cheaperAlternatives.map(({ product: altProd, store: altStore, price: altPrice, saving }) => {
                    const meta = getStoreLogoMeta(altStore);
                    return (
                      <div
                        key={`${altProd.id}-${altStore}`}
                        className="relative flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white px-5 pb-5 pt-7 shadow-xs transition-all hover:border-stone-300"
                      >
                        {/* My List icon, top-right (2026-08-17, Jay: "add
                            My list icons to the cheaper alternatives
                            cards - top right, same position as product
                            cards") -- the real `AddToListButton` component
                            (already imported into this file for the main
                            assessment view's own save action, see above),
                            dropped in with no prop overrides so it falls
                            back to its own default `absolute right-2 top-2
                            z-10` self-positioning -- the exact same call
                            pattern `ProductListCard.tsx`/`DealCard.tsx` use
                            ("same position as product cards"), which is
                            why this card's outer wrapper picked up
                            `relative` here (it wasn't before) -- the
                            button positions itself against its nearest
                            positioned ancestor, same as on every other
                            product card in the app. */}
                        <AddToListButton productId={altProd.id} />
                        <div className="flex gap-5">
                          <div className="flex h-28 w-28 flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-xl">
                            <Image src={altProd.image} alt={altProd.name} width={112} height={112} unoptimized className="h-full w-full object-contain" />
                          </div>
                          <div className="flex min-w-0 flex-grow flex-col justify-between py-1">
                            <div className="space-y-1">
                              {/* "·" separator dropped between brand and
                                  unit (2026-08-17, Jay: "remove the extra
                                  separator dot after the brand titles on
                                  the alternative cards") -- brand and unit
                                  now just space-separated, e.g. "Anchor
                                  2L" instead of "Anchor · 2L". Scoped to
                                  this list only, per Jay's wording -- the
                                  top summary card just above (same "brand
                                  · unit" pattern) wasn't mentioned and is
                                  untouched. */}
                              <p className="text-[11px] font-black tracking-wider text-ink-600">
                                {altProd.brand
                                  ? altProd.brand.charAt(0).toUpperCase() + altProd.brand.slice(1).toLowerCase()
                                  : altProd.brand}{" "}
                                {altProd.unit}
                              </p>
                              <h3 className="mt-1 font-display text-base font-bold leading-snug text-stone-900">{altProd.name}</h3>
                              <span className="mt-2 inline-block rounded-md border border-fair-100/50 bg-fair-50 px-2.5 py-2 text-[13px] leading-4 font-semibold tracking-wider text-fair-800">
                                Save <strong className="font-extrabold">${saving.toFixed(2)}</strong> compared to original item checked
                              </span>
                            </div>
                            <div className="mt-3.5 flex flex-wrap items-center gap-3">
                              <div className="flex flex-shrink-0 items-baseline gap-1 whitespace-nowrap">
                                <span className="text-[11px] font-bold tracking-wider text-stone-500">Lowest price:</span>
                                <span className="font-display text-base font-black text-stone-900">${altPrice.toFixed(2)}</span>
                              </div>
                              <span className={`select-none rounded-md px-2 py-1 text-[10px] font-black ${meta.bg} ${meta.text}`}>{meta.short}</span>
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}

