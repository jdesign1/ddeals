"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronRight, ExternalLink, Share, X } from "lucide-react";
import {
  loadLiveProducts,
  refreshLiveProducts,
  fetchPriceHistory90d,
  validateCurrentDeal,
  applyTargetedDealToProducts,
  updateCatalogueCacheProducts,
  type ProductCard,
  type PriceHistoryPoint,
  type CurrentDeal,
  type AssessmentVerdict,
  isUncertainAssessment,
  getAssessmentVerdict,
  buildAssessmentSummaryCopy,
  getStoreProductUrl,
  getSpecialPriceRange,
  formatUnitPrice,
  shouldDisplayAssessmentUnitPrice,
  getRealAveragePrice,
  buildRankingList,
  buildVisibleRanking,
  buildPriceHistoryInsights,
  findCheaperAlternatives,
  findDealForStore,
  canonicalStoreKey,
  getTrustedDealLocation,
  normalizeStoreKey,
  STORE_DISPLAY_FALLBACK,
  logDealCheck,
  describeFetchError,
} from "@dodgey-deals/shared";
import { supabaseConfig } from "@/lib/config";
import { useAuthStatus } from "@/lib/auth-context";
import { useSearchCatalogue, useSearchNavigation } from "@/lib/search-context";
import { requireAccountsSupabaseClient } from "@/lib/accounts-supabase-client";
import StoreLogoBadge from "@/components/StoreLogoBadge";
import { usePageHeader } from "@/lib/header-context";
import PriceHistoryInsightCard from "@/components/PriceHistoryInsightCard";
import PriceHistoryChart, { ALL_STORES_VALUE } from "@/components/PriceHistoryChart";
import PriceTimingRecommendation, { type PriceTimingSeries } from "@/components/PriceTimingRecommendation";
import InsightCarousel from "@/components/InsightCarousel";
import CheaperAlternativesSection from "@/components/CheaperAlternativesSection";
import ErrorState from "@/components/ErrorState";
import AddToListButton from "@/components/AddToListButton";
import ProductImage from "@/components/ProductImage";
import PageLoader from "@/components/PageLoader";
import { getPrimedDealProduct } from "@/lib/deal-navigation";
import AssessmentEvidenceCard from "@/components/AssessmentEvidenceCard";
import CommunityPriceNotesSection from "@/components/CommunityPriceNotesSection";
import { subscribeToCatalogueUpdates, publishCatalogueUpdate } from "@/lib/catalogue-refresh";
import { getVerdictTitle, VERDICT_BADGE } from "@/lib/assessment-verdict";

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
 *    that remains a separate UI follow-up. This page now does make one small,
 *    targeted `price_history` fetch for the 90-day chart below; the full
 *    catalogue still does not load raw history (`ProductCard.priceHistory`
 *    remains `[]`, see data.ts).
 *  - No search bar on this page (2026-08-17, per Jay: "Remove the search
 *    bar on the deal assessment pages"). This page briefly rendered the
 *    real, shared `SearchBar.tsx` component earlier the same day (replacing
 *    an old hand-rolled lookalike -- see project.md for that history), but
 *    Jay's next ask removed it outright rather than reverting to the
 *    lookalike. The split search hooks are still used below for the
 *    catalogue and "return to search results after Back" behaviour (`returnToSearch`/
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

function storesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeStoreKey(left);
  const normalizedRight = normalizeStoreKey(right);
  return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function DealActions({ productId, productName, dataOnboarding, immediateAdd = false }: { productId: string; productName: string; dataOnboarding?: string; immediateAdd?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          if (navigator.share) {
            navigator.share({ title: productName, url: window.location.href }).catch(() => {});
          } else if (navigator.clipboard) {
            navigator.clipboard.writeText(window.location.href).catch(() => {});
          }
        }}
        aria-label="Share"
        className="flex h-11 w-11 items-center justify-center rounded-full text-stone-900 transition-colors hover:bg-stone-100"
      >
        <Share className="block h-5 w-5" aria-hidden="true" />
      </button>
      <AddToListButton
        productId={productId}
        productName={productName}
        immediateAdd={immediateAdd}
        dataOnboarding={dataOnboarding}
        containerClassName="relative"
        buttonClassName="flex h-9 w-9 items-center justify-center rounded-full border border-stone-900 bg-white text-stone-900"
        iconClassName="h-5 w-5"
      />
    </div>
  );
}

function DealStoreLink({
  deal,
  productName,
  className = "mt-0.5 inline-block",
}: {
  deal: CurrentDeal;
  productName: string;
  className?: string;
}) {
  const storeLabel = STORE_DISPLAY_FALLBACK[normalizeStoreKey(deal.store)] || deal.store;
  const location = getTrustedDealLocation(deal);
  const label = `At ${storeLabel}${location ? ` ${location}` : ""}`;

  return (
    <a
      href={deal.productUrl || getStoreProductUrl(deal.store, productName)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${label} product listing`}
      className={`${className} min-h-11 max-w-full rounded-md py-1 text-left text-[15px] font-bold leading-5 text-stone-700 underline decoration-stone-400 underline-offset-2 transition-colors hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700`}
    >
      <span className="break-words">{label}</span>
      <ChevronRight className="ml-0.5 inline-block h-4 w-4 align-[-0.2em]" aria-hidden="true" />
    </a>
  );
}

/**
 * Verdict badge, ADDED 2026-08-20, per Jay: "Is there a badge we can use for
 * fair and dodge deal assessment pages? so the badge usage is consistent" --
 * this page previously only showed a badge for `verdict === "Real Saver"`
 * (the "Verified special" badge, added earlier the same day -- see that
 * change's own doc comment further down, near where it renders). Dodgy Deal
 * and Fair Deal verdicts got no badge at all, which read as inconsistent
 * once Real Saver had one: not "this verdict has no badge because there's
 * nothing to say," just an asymmetry. All 5 `AssessmentVerdict` values now
 * get one, same `.dd-badge` primitive, same size/icon convention.
 *
 * Colors reuse this file's own existing `verdictBorderClass`
 * semantics (`fair`/`alert`/`dodgy` per verdict) rather than inventing a new
 * palette -- `dd-badge-dodgy` for Fair Deal isn't a typo: the `.dd-badge-*`
 * class *names* are color-token names, not verdict names, and the
 * `ProductListCard.tsx`/`ListItemProductCard.tsx` verdict badges already
 * established this exact mapping (Fair Price -> the amber "dodgy" token, see
 * those files' own `DEAL_TYPE_BADGE` maps) -- matched here, not reinvented,
 * for the "consistent" part of Jay's ask.
 *
 * Badge labels provide the shopper decision alongside the main verdict title.
 */
function getEvidenceSummary(): string {
  return "See the evidence";
}

function AnimatedVerdictBadge({
  badge,
  animationKey,
  label = badge.label,
  className = "",
}: {
  badge: (typeof VERDICT_BADGE)[AssessmentVerdict];
  animationKey: string;
  label?: string;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const BadgeIcon = badge.icon;

  return (
    <motion.span
      key={animationKey}
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.84 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { delay: 0.34, type: "spring", stiffness: 420, damping: 18, mass: 0.7 }
      }
      style={{ transformOrigin: "center" }}
      className={`dd-badge ${badge.className} ${className}`.trim()}
    >
      <BadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </motion.span>
  );
}

export default function DealAssessmentPage() {
  const params = useParams<{ id: string; store: string }>();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { user } = useAuthStatus();
  const { products: catalogueProducts } = useSearchCatalogue();
  const { returnToSearch, resumeAfterDealBack } = useSearchNavigation();

  const productId = decodeURIComponent(params.id);
  const dealStore = decodeURIComponent(params.store);
  const primedProduct = getPrimedDealProduct(productId, dealStore);

  const [products, setProducts] = useState<ProductCard[] | null>(() => (primedProduct ? [primedProduct] : null));
  const [hasLoadedStandaloneCatalogue, setHasLoadedStandaloneCatalogue] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEvidenceSheetOpen, setIsEvidenceSheetOpen] = useState(false);
  // Same plain-counter retry pattern as search-context.tsx/specials/page.tsx
  // (2026-08-11) -- lets ErrorState's Try Again button re-run the fetch
  // below instead of leaving "Couldn't load this deal" as a dead end.
  const [retryTick, setRetryTick] = useState(0);
  const staleRetryKeyRef = useRef<string | null>(null);
  const targetedValidationKeyRef = useRef<string | null>(null);
  const confirmedMissingDealRef = useRef<{
    routeKey: string;
    sourceProductId: string;
    sourceStoreId: string;
  } | null>(null);
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
    if (catalogueProducts.length > 0) {
      return () => {
        cancelled = true;
      };
    }
    loadLiveProducts(supabaseConfig)
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows);
          setHasLoadedStandaloneCatalogue(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(describeFetchError(err, "Failed to load deal data"));
      });
    return () => {
      cancelled = true;
    };
  }, [catalogueProducts, retryTick]);

  // This is an in-memory fan-out from SearchProvider, not another network
  // request. It keeps a direct-link snapshot aligned with a refresh that
  // completes while the detail page is open.
  useEffect(() => subscribeToCatalogueUpdates((result) => {
    setProducts(result);
    setLoadError(null);
  }), []);

  const effectiveProducts = catalogueProducts.length > 0 ? catalogueProducts : products;
  const isCatalogueReady = catalogueProducts.length > 0 || hasLoadedStandaloneCatalogue;
  const product = useMemo(() => effectiveProducts?.find((p) => p.id === productId) ?? null, [effectiveProducts, productId]);
  // The deal route fetches its own validated snapshot, but the tapped card's
  // product is already in the global catalogue. Use that name immediately so
  // the shared header never publishes a temporary "Deal" title while the
  // detail fetch is in flight. Direct/deep links fall back to the app title
  // until their product snapshot resolves.
  const headerProduct = useMemo(
    () => product ?? catalogueProducts.find((p) => p.id === productId) ?? null,
    [catalogueProducts, product, productId]
  );
  const deal = useMemo(() => (product ? findDealForStore(product.currentDeals, dealStore) : undefined), [product, dealStore]);

  const historyRouteKey = `${productId}::${dealStore}`;
  const [assessmentSelection, setAssessmentSelection] = useState<{ routeKey: string; store: string | null }>({
    routeKey: "",
    store: null,
  });
  const [historySelection, setHistorySelection] = useState<{ routeKey: string; store: string | null }>({
    routeKey: "",
    store: null,
  });
  const selectedAssessmentStore = assessmentSelection.routeKey === historyRouteKey ? assessmentSelection.store : null;
  const activeDeal = useMemo(
    () => (product ? findDealForStore(product.currentDeals, selectedAssessmentStore ?? dealStore) ?? deal : deal),
    [deal, dealStore, product, selectedAssessmentStore]
  );
  const selectAssessmentStore = useCallback(
    (store: string) => {
      setAssessmentSelection({ routeKey: historyRouteKey, store });
      setHistorySelection({ routeKey: historyRouteKey, store });
    },
    [historyRouteKey]
  );
  const selectHistoryStore = useCallback(
    (store: string) => {
      setHistorySelection({ routeKey: historyRouteKey, store });
    },
    [historyRouteKey]
  );
  const historyStoreDeals = useMemo(() => {
    if (!product) return [];
    const seen = new Set<string>();
    return product.currentDeals.filter((candidate) => {
      if (!candidate.sourceProductId || !candidate.sourceStoreId) return false;
      const key = canonicalStoreKey(candidate.store);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [product]);
  // Multi-supermarket products should open with the comparison graph visible
  // across every available supermarket. A user's explicit selection still
  // wins after the route has been initialised; single-supermarket products
  // keep the existing single-store presentation.
  const selectedHistoryStore =
    historySelection.routeKey === historyRouteKey
      ? historySelection.store
      : historyStoreDeals.length > 1
        ? ALL_STORES_VALUE
        : null;
  const historyDeal = useMemo(
    () =>
      selectedHistoryStore === ALL_STORES_VALUE
        ? activeDeal
        : product
          ? findDealForStore(product.currentDeals, selectedHistoryStore ?? selectedAssessmentStore ?? dealStore) ?? activeDeal
          : activeDeal,
    [activeDeal, dealStore, product, selectedAssessmentStore, selectedHistoryStore]
  );
  const historyStoreOptions = useMemo(
    () => [
      ...(historyStoreDeals.length > 1 ? [{ value: ALL_STORES_VALUE, label: "All" }] : []),
      ...historyStoreDeals.map((candidate) => ({ value: candidate.store, label: candidate.store })),
    ],
    [historyStoreDeals]
  );
  const effectiveHistoryStore = historyDeal?.store ?? dealStore;
  const priceHistoryKey =
    historyDeal?.sourceProductId && historyDeal.sourceStoreId
      ? `${historyDeal.sourceProductId}::${historyDeal.sourceStoreId}`
      : null;
  const [priceHistoryResults, setPriceHistoryResults] = useState<
    Record<string, { points: PriceHistoryPoint[]; error: string | null }>
  >({});
  const [isPriceHistoryNearViewport, setIsPriceHistoryNearViewport] = useState(false);
  const priceHistorySectionRef = useRef<HTMLDivElement>(null);
  const priceHistoryResult = priceHistoryKey ? priceHistoryResults[priceHistoryKey] : undefined;
  const priceHistoryLoading = priceHistoryKey != null && priceHistoryResult == null;
  const priceHistoryPoints = useMemo(() => priceHistoryResult?.points ?? [], [priceHistoryResult]);

  const historyDealsToLoad = useMemo(
    () => {
      if (selectedHistoryStore !== ALL_STORES_VALUE) return historyDeal ? [historyDeal] : [];
      // Keep the first assessment request focused on the supermarket the user
      // opened. The remaining retailers are fetched when this card is near the
      // viewport, preserving the default All-supermarkets view without making
      // off-screen history compete with the first paint.
      return isPriceHistoryNearViewport ? historyStoreDeals : historyDeal ? [historyDeal] : [];
    },
    [historyDeal, historyStoreDeals, isPriceHistoryNearViewport, selectedHistoryStore]
  );

  useEffect(() => {
    const section = priceHistorySectionRef.current;
    if (!section) return;
    // The section can mount after the first render while the catalogue loads;
    // retry when that data arrives instead of leaving the All-store view gated.
    if (typeof IntersectionObserver === "undefined") {
      const fallbackFrame = window.requestAnimationFrame(() => setIsPriceHistoryNearViewport(true));
      return () => window.cancelAnimationFrame(fallbackFrame);
    }
    const scrollRoot = section.closest(".mobile-scroll-surface");
    let fallbackTimer: number | null = window.setTimeout(() => {
      setIsPriceHistoryNearViewport(true);
    }, 2000);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsPriceHistoryNearViewport(true);
        observer.disconnect();
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      },
      { root: scrollRoot, rootMargin: "240px 0px" },
    );
    observer.observe(section);
    return () => {
      observer.disconnect();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [historyRouteKey, historyStoreDeals.length, isCatalogueReady]);

  // The catalogue carries summary history statistics only. The detail page
  // fetches the small, exact product/store transition series on demand,
  // keeping the 90-day chart useful without adding thousands of rows to the
  // full catalogue payload. The "All" view loads one series per retailer.
  useEffect(() => {
    const pendingDeals = historyDealsToLoad.filter((candidate) => {
      if (!candidate.sourceProductId || !candidate.sourceStoreId) return false;
      const key = `${candidate.sourceProductId}::${candidate.sourceStoreId}`;
      return !priceHistoryResults[key];
    });
    if (pendingDeals.length === 0) return;
    let cancelled = false;
    Promise.all(
      pendingDeals.map(async (candidate) => {
        const key = `${candidate.sourceProductId}::${candidate.sourceStoreId}`;
        try {
          const points = await fetchPriceHistory90d(supabaseConfig, candidate.sourceProductId!, candidate.sourceStoreId!);
          return [key, { points, error: null }] as const;
        } catch {
          return [key, { points: [], error: "history-unavailable" }] as const;
        }
      })
    ).then((results) => {
      if (!cancelled) {
        setPriceHistoryResults((previous) => ({ ...previous, ...Object.fromEntries(results) }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [historyDealsToLoad, priceHistoryResults]);

  const priceHistorySeries = useMemo(
    () =>
      historyStoreDeals.map((candidate) => {
        const key = `${candidate.sourceProductId}::${candidate.sourceStoreId}`;
        return {
          store: candidate.store,
          points: priceHistoryResults[key]?.points ?? [],
          currentPrice: candidate.price,
          currentIsSpecial: candidate.isOnSpecial !== false,
          verdict: getAssessmentVerdict(candidate),
        };
      }),
    [historyStoreDeals, priceHistoryResults]
  );
  const isAllHistorySelected = selectedHistoryStore === ALL_STORES_VALUE;
  const allHistoryResultsReady = historyStoreDeals.every((candidate) => {
    const key = `${candidate.sourceProductId}::${candidate.sourceStoreId}`;
    return Boolean(priceHistoryResults[key]);
  });
  const priceHistoryLoadingForSelection = isAllHistorySelected
    ? !isPriceHistoryNearViewport || !allHistoryResultsReady
    : priceHistoryLoading;
  const allHistoryResults = historyStoreDeals.map((candidate) =>
    priceHistoryResults[`${candidate.sourceProductId}::${candidate.sourceStoreId}`]
  );
  const priceHistoryErrorForSelection = isAllHistorySelected
    ? allHistoryResults.length > 0 && allHistoryResults.every((result) => result?.error)
      ? "history-unavailable"
      : null
    : priceHistoryResult?.error ?? null;

  // The catalogue is intentionally allowed to render from IndexedDB first,
  // but a deal assessment should validate the exact retailer row in the
  // background. This is one small cache read instead of another full
  // catalogue download, and it catches both verdict changes and specials
  // that have rolled off since the catalogue snapshot was saved.
  useEffect(() => {
    if (!effectiveProducts || !product || deal?.isOnSpecial === false || !deal?.sourceProductId || !deal.sourceStoreId) return;
    const sourceProductId = deal.sourceProductId;
    const sourceStoreId = deal.sourceStoreId;
    const validationKey = `${sourceProductId}::${sourceStoreId}`;
    if (targetedValidationKeyRef.current === validationKey) return;
    targetedValidationKeyRef.current = validationKey;

    let cancelled = false;
    validateCurrentDeal(supabaseConfig, sourceProductId, sourceStoreId)
      .then(({ row }) => {
        if (cancelled) return;
        const nextProducts = applyTargetedDealToProducts(effectiveProducts, sourceProductId, sourceStoreId, row);
        if (row === null) {
          confirmedMissingDealRef.current = {
            routeKey: `${productId}::${dealStore}`,
            sourceProductId,
            sourceStoreId,
          };
        } else {
          confirmedMissingDealRef.current = null;
        }
        setProducts(nextProducts);
        void updateCatalogueCacheProducts(nextProducts);
        publishCatalogueUpdate(nextProducts);
      })
      .catch(() => {
        // Keep the cached assessment visible if the small revalidation request
        // fails. The existing full-refresh/error paths remain available.
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveProducts, product, deal, productId, dealStore]);

  // A stale deep link can miss because the product or its store deal rolled
  // off the live catalogue. Retry once through the shared cooldown-guarded
  // refresh before showing the final "no longer exists" state. The key guard
  // prevents an expired link from causing a refresh loop.
  useEffect(() => {
    if (effectiveProducts === null || loadError || (product && deal)) return;
    const retryKey = `${productId}::${dealStore}`;
    if (staleRetryKeyRef.current === retryKey) return;
    staleRetryKeyRef.current = retryKey;
    let cancelled = false;
    refreshLiveProducts(supabaseConfig)
      .then((result) => {
        if (!cancelled) {
          const confirmedMissing = confirmedMissingDealRef.current;
          const refreshedProducts = confirmedMissing?.routeKey === retryKey
            ? applyTargetedDealToProducts(
                result.products,
                confirmedMissing.sourceProductId,
                confirmedMissing.sourceStoreId,
                null
              )
            : result.products;
          setProducts(refreshedProducts);
          setLoadError(null);
          publishCatalogueUpdate(refreshedProducts);
        }
      })
      .catch(() => {
        // The normal missing-deal state below remains the useful fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveProducts, loadError, product, deal, productId, dealStore]);

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
    logDealCheck(requireAccountsSupabaseClient(), user.id, product.id, deal.store, deal.price, deal.originalPrice, deal.dealType).catch(
      (err: unknown) => {
        console.warn("logDealCheck failed:", err instanceof Error ? err.message : err);
      }
    );
  }, [user, product, deal]);

  // "Cheaper alternatives" display, 3rd iteration: full page-swap (until
  // 2026-08-12) -> bottom sheet overlay (2026-08-12 to 2026-08-21) -> now
  // an inline expand/collapse carousel (2026-08-21, per Jay's ask: "the
  // container will grow and show a carousel of the cheaper options
  // (instead of the bottom sheet)"). Plain boolean now instead of the old
  // `currentView: "assessment" | "cheaper-alternatives"` union -- this no
  // longer swaps between two whole VIEWS (the assessment content stays on
  // screen either way), it just shows/hides one inline section, so a
  // boolean is what the state actually means now.
  const [showCheaperCarousel, setShowCheaperCarousel] = useState(false);
  const toggleCheaperCarousel = useCallback(() => {
    setShowCheaperCarousel((open) => !open);
  }, []);
  const [priceHistoryTab, setPriceHistoryTab] = useState<"should-buy" | "price-tips">("price-tips");
  const [showProductImage, setShowProductImage] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const backNavigationStartedRef = useRef(false);

  useLayoutEffect(() => {
    if (!showProductImage) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowProductImage(false);
    };
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    // CSS overscroll containment and a fixed body cover most browsers, but
    // iOS WebViews can still turn a downward touch gesture into pull-to-refresh
    // unless the active touchmove is explicitly cancelled.
    const preventPullToRefresh = (event: TouchEvent) => event.preventDefault();
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("touchmove", preventPullToRefresh, { passive: false });
    return () => {
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("touchmove", preventPullToRefresh);
      window.scrollTo(0, scrollY);
    };
  }, [showProductImage]);

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
    if (backNavigationStartedRef.current) return;
    backNavigationStartedRef.current = true;
    setIsNavigatingBack(true);
    window.setTimeout(() => {
      if (returnToSearch && returnToSearch.productId === productId && returnToSearch.store === dealStore) {
        resumeAfterDealBack();
      }
      router.back();
    }, 280);
  };
  // No longer branches on `currentView` (2026-08-12, and still true after
  // the 2026-08-21 bottom-sheet -> inline-carousel change) -- "cheaper
  // alternatives" has never been its own full-page view since 2026-08-12,
  // first as a sheet layered over this view, now as a section that expands
  // in place within it, so the global header stays on this page's own
  // title/back button throughout either way.
  const headerTitle = headerProduct?.name ?? null;
  const headerActions = headerProduct ? (
    <DealActions productId={headerProduct.id} productName={headerProduct.name} dataOnboarding="deal-save" immediateAdd />
  ) : null;
  usePageHeader(headerTitle, onBack, headerActions);

  const rankingList = useMemo(() => (product ? buildRankingList(product) : []), [product]);
  const isMultiStoreDeal = rankingList.length > 1;
  const visibleRanking = useMemo(() => (product ? buildVisibleRanking(product, rankingList) : []), [product, rankingList]);
  const specialPriceRange = useMemo(() => (product ? getSpecialPriceRange(product) : null), [product]);
  // Always "all" stores now (2026-08-12) -- the supermarket filter pills
  // that used to let Jay narrow this down (`selectedStores` state +
  // `handleStoreToggle`) were removed per his ask ("don't display
  // supermarket pills on the cheaper alternatives page"), so there's no UI
  // left that ever changes this; passing the literal array inline instead
  // of keeping a never-updated state variable around.
  const cheaperAlternatives = useMemo(
    () => (product && activeDeal && effectiveProducts
      ? findCheaperAlternatives(product, effectiveProducts, activeDeal.price, ["all"])
      : []),
    [activeDeal, effectiveProducts, product]
  );
  // Summary insight tiles for the 90-day price tips panel. Built from the
  // `dodgy_deals` view's price_history_90d_* columns (see data.ts).
  const insights = useMemo(() => (activeDeal ? buildPriceHistoryInsights(activeDeal) : []), [activeDeal]);
  const priceTimingSeries = useMemo<PriceTimingSeries[]>(
    () =>
      isAllHistorySelected
        ? priceHistorySeries.map(({ store, points, currentPrice, currentIsSpecial }) => ({ store, points, currentPrice, currentIsSpecial }))
        : [
            {
              store: effectiveHistoryStore,
              points: priceHistoryPoints,
              currentPrice: historyDeal?.price ?? activeDeal?.price ?? 0,
              currentIsSpecial: historyDeal?.isOnSpecial ?? activeDeal?.isOnSpecial ?? false,
            },
          ],
    [
      effectiveHistoryStore,
      historyDeal,
      isAllHistorySelected,
      priceHistoryPoints,
      priceHistorySeries,
      activeDeal,
    ]
  );

  if (loadError) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <ErrorState message="Couldn't load this deal." detail={loadError} onRetry={retry} />
          {/* text-[13px] -> text-sm (14px), 2026-08-20, per Jay: "Increase
              all body texts on the deal assessment page to be 14px for
              readability" -- see this file's own note further down (near
              the first bumped paragraph) for the full scope of what counts
              as "body text" for this pass. */}
          <Link href="/" className="text-sm leading-4 font-bold text-ink-600 underline">
            Back to Home
          </Link>
        </div>
      </>
    );
  }

  if (effectiveProducts === null) {
    return <PageLoader loading />;
  }

  if ((!product || !deal || !activeDeal) && !isCatalogueReady && !loadError) {
    return <PageLoader loading />;
  }

  if (!product || !deal || !activeDeal) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm font-bold text-stone-700">This deal isn&rsquo;t on special right now.</p>
          <p className="text-sm leading-4 text-stone-500">It may have ended, or the link is out of date.</p>
          <Link href="/" className="text-sm leading-4 font-bold text-ink-600 underline">
            Back to Home
          </Link>
        </div>
      </>
    );
  }

  const selectedDeal = activeDeal;
  const selectedUnitPrice = shouldDisplayAssessmentUnitPrice(product.category, product.name, selectedDeal.saleUnitLabel)
    ? formatUnitPrice(selectedDeal.saleUnitPrice, selectedDeal.saleUnitLabel)
    : null;
  const verdict = getAssessmentVerdict(selectedDeal);
  const uncertain = isUncertainAssessment(verdict);
  const verdictColorClass =
    verdict === "Real Saver" ? "text-fair-800" : verdict === "Dodgy Deal" ? "text-alert-800" : uncertain ? "text-stone-700" : "text-dodgy-900";
  const verdictBgClass =
    verdict === "Real Saver" ? "bg-fair-50" : verdict === "Dodgy Deal" ? "bg-alert-50" : uncertain ? "page-paper-surface" : "bg-dodgy-50";
  const verdictBorderClass =
    verdict === "Real Saver" ? "border-fair-200" : verdict === "Dodgy Deal" ? "border-alert-200" : uncertain ? "border-stone-200" : "border-dodgy-200";
  const verdictBadge = VERDICT_BADGE[verdict];

  // `rankingList` contains each supermarket's current price, while
  // `visibleRanking` is the special-only subset. Keep these separate: the
  // verdict and explanation below belong to the supermarket selected for
  // this page, while the ranking/alternative note is explicitly cross-store.
  const lowestCurrentPriceItem = rankingList[0];
  const lowestSpecialStoreItem = visibleRanking[0];

  // Multi-store pages use the newer verdict-based treatment. Single-store
  // pages retain the original price-vs-average treatment.
  const dealAveragePrice = getRealAveragePrice(product, selectedDeal.store);
  const dealPriceColorClass =
    dealAveragePrice == null || dealAveragePrice <= 0 || selectedDeal.price === dealAveragePrice
      ? "text-stone-900"
      : selectedDeal.price < dealAveragePrice
        ? "text-fair-700"
        : "text-alert-700";
  const multiStoreDealPriceColorClass = verdict === "Real Saver" ? "text-fair-700" : "text-stone-900";

  const assessmentSummary = buildAssessmentSummaryCopy(selectedDeal);
  const evidenceSummary = getEvidenceSummary();
  const bestPriceCents = lowestCurrentPriceItem ? Math.round(lowestCurrentPriceItem.price * 100) : null;

  return (
    <>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: isNavigatingBack || effectiveProducts === null ? "100%" : 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={`deal-assessment-page min-h-full w-full ${isMultiStoreDeal ? "page-paper-surface" : verdictBgClass}`}
      >
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

      {isMultiStoreDeal ? (
        <>
      {rankingList.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-xs">
          <h3 className="mb-2 dd-type-section text-stone-900">Select a supermarket</h3>
          <div className="divide-y divide-stone-100" role="tablist" aria-label="Supermarket price ranking">
            {rankingList.map((item) => {
              const storeDeal = findDealForStore(product.currentDeals, item.store);
              if (!storeDeal) return null;
              const isCurrentStore = storesMatch(item.store, selectedDeal.store);
              const isBestPrice = bestPriceCents != null && Math.round(item.price * 100) === bestPriceCents;
              const storeUnitPrice = shouldDisplayAssessmentUnitPrice(product.category, product.name, storeDeal.saleUnitLabel)
                ? formatUnitPrice(storeDeal.saleUnitPrice, storeDeal.saleUnitLabel)
                : null;
              const bestSpecialPriceCents = lowestSpecialStoreItem ? Math.round(lowestSpecialStoreItem.price * 100) : null;
              const isBestSpecialPrice = storeDeal.isOnSpecial !== false && bestSpecialPriceCents != null && Math.round(item.price * 100) === bestSpecialPriceCents;
              return (
                <button
                  key={item.store}
                  type="button"
                  role="tab"
                  aria-selected={isCurrentStore}
                  aria-controls="selected-assessment"
                  onClick={() => selectAssessmentStore(item.store)}
                  className={`-mx-5 flex min-h-[4.5rem] w-[calc(100%+2.5rem)] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 ${isCurrentStore ? "rounded-2xl outline-2 outline outline-offset-0 outline-stone-400" : ""}`}
                  aria-label={`View ${item.store} assessment`}
                >
                  <StoreLogoBadge store={item.store} variant="ranking" />
                  <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-stone-800">{item.store}</span>
                  <span className="flex-shrink-0 text-right">
                    <span className={`block font-display text-base font-extrabold ${isBestPrice ? "text-fair-700" : "text-stone-800"}`}>${item.price.toFixed(2)}</span>
                    {storeUnitPrice && <span className="block dd-type-meta text-stone-500">{storeUnitPrice}</span>}
                    <span className={`block text-xs font-extrabold ${storeDeal.isOnSpecial === false ? "text-stone-500" : isBestSpecialPrice ? "text-fair-700" : "text-stone-900"}`}>
                      {storeDeal.isOnSpecial === false ? "Regular price" : isBestSpecialPrice ? "Best price" : "Special"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <motion.div
        key={`${historyRouteKey}-${selectedDeal.store}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
      <div id="selected-assessment" role="tabpanel" className={`space-y-4 rounded-2xl border-2 bg-white p-5 text-left shadow-xs ${verdictBorderClass}`}>
        <div className="flex min-w-0 items-center gap-2" data-onboarding="deal-verdict">
          <h3 className={`min-w-0 truncate font-display text-lg font-extrabold tracking-tight ${verdictColorClass}`}>
            {getVerdictTitle(verdict)}
          </h3>
          {!uncertain && (
            <button type="button" onClick={() => setIsEvidenceSheetOpen(true)} aria-haspopup="dialog" aria-expanded={isEvidenceSheetOpen} aria-label={`See the evidence for this ${verdict} assessment`} className="inline-flex flex-shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700">
              <AnimatedVerdictBadge badge={verdictBadge} animationKey={`selected-${product.id}-${selectedDeal.store}-${verdict}`} className="w-fit" />
            </button>
          )}
        </div>
        <div className="flex items-start gap-4" data-onboarding="deal-summary">
          <button type="button" onClick={() => setShowProductImage(true)} aria-label={`View larger image of ${product.name}`} className="product-image-frame deal-assessment-image h-28 w-28 flex-shrink-0 select-none overflow-hidden rounded-lg border-0 p-0">
            <ProductImage src={product.image} alt={product.name} width={112} height={112} className="product-image-content h-full w-full object-contain" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 id="product-summary-heading" className="break-words text-base font-extrabold leading-snug text-stone-900">{product.name}</h2>
            <p className="mt-0.5 dd-type-meta dd-type-meta-strong text-stone-500">{product.unit}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`font-display text-2xl font-extrabold ${multiStoreDealPriceColorClass}`}>${selectedDeal.price.toFixed(2)}</span>
              <span className="text-sm font-bold text-stone-500">ea</span>
            </div>
            {selectedUnitPrice && <p className="mt-0.5 dd-type-meta text-stone-500">{selectedUnitPrice}</p>}
            <DealStoreLink deal={selectedDeal} productName={product.name} />
          </div>
        </div>
        {evidenceSummary && (
          <AssessmentEvidenceCard deal={selectedDeal} verdict={verdict} evidenceSummary={evidenceSummary} assessmentCopy={assessmentSummary.body} compactSpacing open={isEvidenceSheetOpen} onOpenChange={setIsEvidenceSheetOpen} />
        )}

        {isMultiStoreDeal && cheaperAlternatives.length > 0 && (
          <div className="mt-4 space-y-4">
            <button
              onClick={toggleCheaperCarousel}
              aria-expanded={showCheaperCarousel}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-stone-500 bg-white px-4 py-3 text-center dd-type-control text-stone-900 transition-all hover:bg-stone-50"
            >
              <span>See cheaper options</span>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fair-600 dd-type-badge text-white">
                {cheaperAlternatives.length}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${showCheaperCarousel ? "rotate-180" : ""}`}
                strokeWidth={2.5}
                aria-hidden="true"
              />
            </button>

            {/* Keep the carousel aligned with the selected supermarket card's
                edges while preserving the card's height animation. */}
            <AnimatePresence initial={false}>
              {showCheaperCarousel && (
                <motion.div
                  key="cheaper-carousel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", damping: 28, stiffness: 260 }}
                  className="-mx-5 overflow-hidden"
                >
                  <div className="pt-3">
                    <InsightCarousel slideWidthClassName="w-[92%]" trackPaddingClassName="px-5">
                      {cheaperAlternatives.map(({ product: altProd, store: altStore, price: altPrice, saving }) => (
                        <div key={`${altProd.id}-${altStore}`}>
                          <div className="dd-deal-assessment-card relative flex min-h-72 flex-col gap-3 rounded-2xl border border-stone-300 bg-white px-5 pb-5 pt-7 shadow-xs">
                            <AddToListButton productId={altProd.id} productName={altProd.name} />
                            <div className="flex items-start gap-4">
                              <div className="product-image-frame deal-assessment-image flex h-24 w-24 flex-shrink-0 select-none items-center justify-center overflow-hidden rounded-xl">
                                <ProductImage
                                  src={altProd.image}
                                  alt={altProd.name}
                                  width={96}
                                  height={96}
                                  className="product-image-content h-full w-full object-contain mix-blend-multiply"
                                />
                              </div>
                              <div className="min-w-0 flex-grow py-1">
                                <div className="space-y-1">
                                  <p className="dd-type-secondary dd-type-secondary-strong text-ink-600">
                                    {altProd.brand
                                      ? altProd.brand.charAt(0).toUpperCase() + altProd.brand.slice(1).toLowerCase()
                                      : altProd.brand}{" "}
                                    {altProd.unit}
                                  </p>
                                  <h3 className="mt-1 line-clamp-2 font-display text-base font-bold leading-snug text-stone-900">
                                    {altProd.name}
                                  </h3>
                                  <div className="mt-2 flex items-baseline gap-1 whitespace-nowrap">
                                    <span className="font-display text-base font-extrabold text-stone-900">${altPrice.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <span className="dd-cheaper-saving-badge block w-full rounded-md border border-fair-800 bg-fair-800 px-2.5 py-2 dd-type-secondary dd-type-secondary-strong text-white">
                              Save <strong className="font-extrabold">${saving.toFixed(2)}</strong> compared to original item checked
                            </span>
                            <a
                              href={findDealForStore(altProd.currentDeals, altStore)?.productUrl || getStoreProductUrl(altStore, altProd.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="dd-type-control mt-auto flex w-full items-center justify-center gap-2 rounded-full border border-stone-400 bg-white py-2.5 text-center text-stone-700 transition-all hover:bg-stone-50"
                            >
                              <span aria-hidden="true">
                                <StoreLogoBadge store={altStore} variant="card" />
                              </span>
                              Go to {altStore}
                              <ExternalLink className="h-4 w-4 opacity-60" aria-hidden="true" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </InsightCarousel>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

      </div>
      </motion.div>
        </>
      ) : (
        <div className={`space-y-4 rounded-2xl border-2 bg-white p-5 text-left shadow-xs ${verdictBorderClass}`}>
          <div className="min-w-0" data-onboarding="deal-verdict">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className={`min-w-0 truncate font-display text-lg font-extrabold tracking-tight ${verdictColorClass}`}>
                {getVerdictTitle(verdict)}
              </h2>
              {!uncertain && (
                <button
                  type="button"
                  onClick={() => setIsEvidenceSheetOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={isEvidenceSheetOpen}
                  aria-label={`See the evidence for this ${verdict} assessment`}
                  className="inline-flex flex-shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
                >
                  <AnimatedVerdictBadge
                    badge={verdictBadge}
                    animationKey={`selected-${product.id}-${selectedDeal.store}-${verdict}`}
                    className="w-fit"
                  />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-start gap-4" data-onboarding="deal-summary">
            <button
              type="button"
              onClick={() => setShowProductImage(true)}
              aria-label={`View larger image of ${product.name}`}
              className="product-image-frame deal-assessment-image h-28 w-28 flex-shrink-0 select-none overflow-hidden rounded-lg border-0 p-0"
            >
              <ProductImage src={product.image} alt={product.name} width={112} height={112} className="product-image-content h-full w-full object-contain" />
            </button>
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-base font-extrabold leading-snug text-stone-900">{product.name}</h3>
              <p className="mt-0.5 dd-type-meta dd-type-meta-strong text-stone-500">{product.unit}</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`font-display text-2xl font-extrabold ${dealPriceColorClass}`}>${selectedDeal.price.toFixed(2)}</span>
                <span className="text-sm font-bold text-stone-500">ea</span>
              </div>
              {selectedUnitPrice && (
                <p className="mt-0.5 dd-type-meta text-stone-500" aria-label={`Unit price ${selectedUnitPrice.replace("/", " per ")}`}>
                  {selectedUnitPrice}
                </p>
              )}
              {specialPriceRange && (
                <p className="mt-1 text-sm font-semibold text-stone-600">
                  Special range ${specialPriceRange.lowestPrice.toFixed(2)}–${specialPriceRange.highestPrice.toFixed(2)} across {specialPriceRange.storeCount} supermarkets
                </p>
              )}
              <DealStoreLink deal={selectedDeal} productName={product.name} />
            </div>
          </div>

          {evidenceSummary && (
            <AssessmentEvidenceCard
              deal={selectedDeal}
              verdict={verdict}
              evidenceSummary={evidenceSummary}
              assessmentCopy={assessmentSummary.body}
              open={isEvidenceSheetOpen}
              onOpenChange={setIsEvidenceSheetOpen}
            />
          )}

          <CheaperAlternativesSection
            alternatives={cheaperAlternatives}
            isMultiStoreDeal={false}
            showCarousel={showCheaperCarousel}
            onToggle={toggleCheaperCarousel}
          />
        </div>
      )}

      <div className="space-y-3">
        {/* Keep the detailed history views together, with the practical
            recommendation and supporting price tips in the card below. */}
        <div ref={priceHistorySectionRef} className="space-y-4">
          <div className="dd-deal-assessment-card space-y-4 rounded-2xl border border-stone-300 bg-white p-5 shadow-xs">
            <div>
              <h4 className="dd-type-section text-stone-900">90-day price history</h4>
            </div>
            <div data-onboarding="price-history-chart">
              <PriceHistoryChart
                points={priceHistoryPoints}
                currentPrice={historyDeal?.price ?? selectedDeal.price}
                currentStore={isAllHistorySelected ? "All supermarkets" : effectiveHistoryStore}
                currentIsSpecial={historyDeal?.isOnSpecial ?? selectedDeal.isOnSpecial}
                comparisonPrice={historyDeal?.originalPrice ?? selectedDeal.originalPrice}
                loading={priceHistoryLoadingForSelection}
                error={priceHistoryErrorForSelection}
                historySeries={isAllHistorySelected ? priceHistorySeries : undefined}
                storeOptions={historyStoreOptions}
                selectedStore={isAllHistorySelected ? ALL_STORES_VALUE : effectiveHistoryStore}
                onStoreChange={selectHistoryStore}
                verdict={getAssessmentVerdict(historyDeal ?? selectedDeal)}
              />
            </div>
          </div>
          <div className="dd-deal-assessment-card space-y-4 rounded-2xl border border-stone-300 bg-white p-5 shadow-xs">
            <h4 className="dd-type-section text-stone-900">90-day price tips</h4>
            <div
              className="flex items-center gap-0.5 rounded-lg bg-stone-200 p-1 shadow-inner shadow-black/5"
              role="tablist"
              aria-label="Price timing and tips"
            >
              <button
                type="button"
                role="tab"
                aria-selected={priceHistoryTab === "price-tips"}
                onClick={() => setPriceHistoryTab("price-tips")}
                className={`relative z-0 flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-2 text-center dd-type-control transition-[background-color,color,box-shadow] ${
                  priceHistoryTab === "price-tips" ? "dd-segmented-control-active text-stone-900 shadow-sm ring-1 ring-black/5" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <AnimatePresence initial={false}>
                  {priceHistoryTab === "price-tips" && (
                    <motion.span
                      className="dd-segmented-control-active-fill pointer-events-none absolute inset-0 rounded-md bg-white"
                      style={{ zIndex: -1 }}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </AnimatePresence>
                Price tips
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={priceHistoryTab === "should-buy"}
                onClick={() => setPriceHistoryTab("should-buy")}
                className={`relative z-0 flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-2 text-center dd-type-control transition-[background-color,color,box-shadow] ${
                  priceHistoryTab === "should-buy" ? "dd-segmented-control-active text-stone-900 shadow-sm ring-1 ring-black/5" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <AnimatePresence initial={false}>
                  {priceHistoryTab === "should-buy" && (
                    <motion.span
                      className="dd-segmented-control-active-fill pointer-events-none absolute inset-0 rounded-md bg-white"
                      style={{ zIndex: -1 }}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </AnimatePresence>
                Should you buy?
              </button>
            </div>
            {priceHistoryTab === "should-buy" ? (
              !priceHistoryLoadingForSelection && !priceHistoryErrorForSelection ? (
                <PriceTimingRecommendation series={priceTimingSeries} />
              ) : null
            ) : (
              <>
                {insights.length > 0 ? (
                  <PriceHistoryInsightCard insights={insights} verdict={verdict} />
                ) : (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center">
                    <p className="text-sm leading-5 font-semibold text-stone-600">
                      We need a little more history before price tips are reliable.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <CommunityPriceNotesSection
        productId={product.id}
        productName={product.name}
        productBrand={product.brand}
        productImage={product.image}
        productUnit={product.unit}
        currentStore={selectedDeal.store}
        currentPrice={selectedDeal.price}
      />
      <section className="rounded-2xl border border-stone-300 bg-white p-5 text-left shadow-xs" aria-labelledby="report-deal-heading">
        <h2 id="report-deal-heading" className="dd-type-section text-stone-900">
          Is this deal incorrect?
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">Get in touch and let us know.</p>
        <Link
          href="/report-deal"
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-full border border-stone-500 bg-transparent px-4 py-2.5 text-center text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
        >
          Report an incorrect deal
        </Link>
      </section>
    </div>
      </motion.div>

    {showProductImage && (
      <div
        className="fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] touch-none items-center justify-center overflow-hidden overscroll-none bg-stone-950/80 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Larger image of ${product.name}`}
        onClick={() => setShowProductImage(false)}
      >
        <button
          type="button"
          onClick={() => setShowProductImage(false)}
          aria-label="Close larger image"
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-stone-900 shadow-lg"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div
          className="flex max-h-[85vh] max-w-[92vw] items-center justify-center rounded-2xl bg-white p-4 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <ProductImage
            src={product.image}
            alt={product.name}
            width={768}
            height={768}
            className="product-image-content max-h-[78vh] max-w-[84vw] object-contain"
          />
        </div>
      </div>
    )}

    </>
  );
}
