"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import {
  canonicalStoreKey,
  describeFetchError,
  groupCategory,
  getAssessmentVerdict,
  getSearchSynonymRule,
  invalidateListsPageCache,
  loadListsPageData,
  LIST_MEMBERSHIP_CHANGED_EVENT,
  matchesAnySelectedStore,
  productMatchesSynonymRule,
  removeItemFromList,
  STORE_DISPLAY_FALLBACK,
  type ListItemLowestPrice,
  type ListItemProductMeta,
  type ListItemRow,
  type ListRow,
  type ProductCard as ProductCardData,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { requireAccountsSupabaseClient } from "@/lib/accounts-supabase-client";
import { supabaseConfig } from "@/lib/config";
import { useNotifications, type UnreadListAlert } from "@/lib/notifications-context";
import ErrorState from "@/components/ErrorState";
import LoadingMascot from "@/components/LoadingMascot";
import MascotImage from "@/components/MascotImage";
import ProductImage from "@/components/ProductImage";
import ShareListsSheet from "@/components/ShareListsSheet";
import ListItemProductCard from "@/components/ListItemProductCard";
import UnreadListItem from "@/components/UnreadListItem";
import WatchlistUpdateSheet from "@/components/WatchlistUpdateSheet";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CategoryPicker from "@/components/CategoryPicker";
import DealTypePicker, { type WatchlistDealTypeFilter } from "@/components/DealTypePicker";
import SupermarketPicker from "@/components/WatchlistViewPicker";
import { AnimatePresence, motion } from "motion/react";
import { WATCHLIST_SHARE_EVENT } from "@/lib/watchlist-events";
import { sortWatchlistItems, watchlistItemDeal } from "@/lib/watchlist-sort";

type WatchlistDealTypeCounts = {
  realSavers: number;
  fairDeals: number;
  dodgyDeals: number;
};

interface WatchlistItem {
  productId: string;
  item: ListItemRow;
  sourceItems: ListItemRow[];
  addedAt: string;
}

const dairyRule = getSearchSynonymRule("dairy");

function matchesDealTypeFilter(
  deal: ReturnType<typeof watchlistItemDeal>,
  filter: WatchlistDealTypeFilter,
): boolean {
  if (filter === "all") return true;
  if (!deal || deal.isOnSpecial !== true) return false;

  const verdict = getAssessmentVerdict(deal);
  return verdict === filter;
}

function dealTypeFilterLabel(filter: WatchlistDealTypeFilter): string {
  if (filter === "all") return "all deal types";
  if (filter === "Fair Price") return "Fair Deals";
  return `${filter}s`;
}

function dealTypeResultHeading(filter: WatchlistDealTypeFilter): string {
  if (filter === "all") return "On special";
  if (filter === "Fair Price") return "Fair Deal";
  return filter;
}

function watchlistItemDealForFilter(
  item: WatchlistItem,
  itemCards: Map<string, ProductCardData>,
  selectedSupermarkets: string[],
  dealTypeFilter: WatchlistDealTypeFilter,
): ReturnType<typeof watchlistItemDeal> {
  if (dealTypeFilter === "all") return watchlistItemDeal(item, itemCards, selectedSupermarkets, undefined, "best");
  const card = itemCards.get(item.productId);
  if (!card) return undefined;
  const matchingDeals = card.currentDeals.filter((deal) => (
    (selectedSupermarkets.includes("all") || matchesAnySelectedStore(deal.store, selectedSupermarkets))
    && matchesDealTypeFilter(deal, dealTypeFilter)
  ));
  if (matchingDeals.length === 0) return undefined;

  return watchlistItemDeal(
    item,
    new Map([[item.productId, { ...card, currentDeals: matchingDeals }]]),
    ["all"],
    undefined,
    "best",
  );
}

function watchlistCategory(product: Pick<ListItemProductMeta, "name" | "brand" | "category"> | undefined): string {
  if (!product) return "";
  const isDairy = dairyRule ? productMatchesSynonymRule(dairyRule, product) : false;
  return isDairy ? "Dairy" : groupCategory(product.category);
}

function otherSpecialStores(product: ProductCardData, displayedStore: string): string[] {
  const displayedKey = canonicalStoreKey(displayedStore);
  const stores = new Map<string, string>();
  for (const deal of product.currentDeals) {
    const storeKey = canonicalStoreKey(deal.store);
    if (deal.isOnSpecial && storeKey && storeKey !== displayedKey && !stores.has(storeKey)) stores.set(storeKey, deal.store);
  }
  return [...stores.values()];
}

export default function ListsPage() {
  const { user, loading: authLoading, openAuthSheet } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const {
    unreadListItemKeys,
    unreadAlerts,
    markListItemViewed,
    markWatchlistVisited,
    pushEnabled,
    pushReady,
    pushAvailableOnDevice,
    pushPermissionState,
    setPushEnabled,
    openNotificationSettings,
  } = useNotifications();
  const [itemsByList, setItemsByList] = useState<Map<string, ListItemRow[]>>(new Map());
  const [productMeta, setProductMeta] = useState<Map<string, ListItemProductMeta>>(new Map());
  const [itemCards, setItemCards] = useState<Map<string, ProductCardData>>(new Map());
  const [lowestPriceByProduct, setLowestPriceByProduct] = useState<Map<string, ListItemLowestPrice>>(new Map());
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDealType, setSelectedDealType] = useState<WatchlistDealTypeFilter>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSupermarkets, setSelectedSupermarkets] = useState<string[]>(["all"]);
  const [isInactiveSectionExpanded, setIsInactiveSectionExpanded] = useState(true);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [isClearWatchlistSheetOpen, setIsClearWatchlistSheetOpen] = useState(false);
  const [isClearingWatchlist, setIsClearingWatchlist] = useState(false);
  const [isSettingUpNotifications, setIsSettingUpNotifications] = useState(false);
  const [selectedWatchlistUpdate, setSelectedWatchlistUpdate] = useState<ReadonlyArray<UnreadListAlert> | null>(null);
  const watchlistVisitRecordedRef = useRef<string | null>(null);

  useEffect(() => {
    const handleShare = () => setIsShareSheetOpen(true);
    window.addEventListener(WATCHLIST_SHARE_EVENT, handleShare);
    return () => window.removeEventListener(WATCHLIST_SHARE_EVENT, handleShare);
  }, []);

  const applyData = useCallback((data: Awaited<ReturnType<typeof loadListsPageData>>) => {
    setItemsByList(data.grouped);
    setProductMeta(data.productMeta);
    setItemCards(data.itemCards);
    setLowestPriceByProduct(data.lowestPriceByProduct);
  }, []);

  const reload = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setLoadingWatchlist(true);
    setError(null);
    invalidateListsPageCache(user.id);
    try {
      const data = await loadListsPageData(requireAccountsSupabaseClient(), supabaseConfig, user.id, { forceRefresh: true });
      applyData(data);
    } catch (loadError) {
      setError(describeFetchError(loadError, "We couldn't load your Watchlist."));
    } finally {
      if (showLoading) setLoadingWatchlist(false);
    }
  }, [applyData, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setLoadingWatchlist(true);
      setError(null);
      loadListsPageData(requireAccountsSupabaseClient(), supabaseConfig, user.id, { forceRefresh: true })
        .then((data) => {
          if (!cancelled) applyData(data);
        })
        .catch((loadError) => {
          if (!cancelled) setError(describeFetchError(loadError, "We couldn't load your Watchlist."));
        })
        .finally(() => {
          if (!cancelled) setLoadingWatchlist(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applyData, user]);

  useEffect(() => {
    if (!userId) {
      watchlistVisitRecordedRef.current = null;
      return;
    }
    if (loadingWatchlist || error || watchlistVisitRecordedRef.current === userId) return;
    watchlistVisitRecordedRef.current = userId;
    markWatchlistVisited();
  }, [error, loadingWatchlist, markWatchlistVisited, userId]);

  useEffect(() => {
    const handleMembershipChanged = () => void reload(false);
    window.addEventListener(LIST_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
    return () => window.removeEventListener(LIST_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
  }, [reload]);

  const watchlistItems = useMemo<WatchlistItem[]>(() => {
    const byProduct = new Map<string, WatchlistItem>();
    for (const items of itemsByList.values()) {
      for (const item of items) {
        const existing = byProduct.get(item.product_id);
        if (existing) {
          existing.sourceItems.push(item);
          existing.item = { ...existing.item, quantity: existing.item.quantity + item.quantity };
          if (new Date(item.added_at).getTime() > new Date(existing.addedAt).getTime()) existing.addedAt = item.added_at;
        } else {
          byProduct.set(item.product_id, {
            productId: item.product_id,
            item: { ...item },
            sourceItems: [item],
            addedAt: item.added_at,
          });
        }
      }
    }
    return [...byProduct.values()];
  }, [itemsByList]);

  const unreadAlertsByListItem = useMemo(() => {
    const grouped = new Map<string, UnreadListAlert[]>();
    for (const alert of unreadAlerts) {
      const key = `${alert.list_id}:${alert.list_item_id}`;
      const updates = grouped.get(key) ?? [];
      updates.push(alert);
      grouped.set(key, updates);
    }
    return grouped;
  }, [unreadAlerts]);

  const newPriceItemCount = useMemo(
    () => watchlistItems.reduce(
      (count, item) => count + (item.sourceItems.some((sourceItem) => unreadListItemKeys.has(`${sourceItem.list_id}:${sourceItem.id}`)) ? 1 : 0),
      0,
    ),
    [unreadListItemKeys, watchlistItems],
  );

  const handleNotificationSetup = useCallback(async () => {
    setIsSettingUpNotifications(true);
    try {
      if (pushAvailableOnDevice && pushPermissionState === "denied") {
        await openNotificationSettings();
      } else if (pushAvailableOnDevice && pushReady) {
        await setPushEnabled(true);
      } else {
        router.push("/settings");
      }
    } finally {
      setIsSettingUpNotifications(false);
    }
  }, [openNotificationSettings, pushAvailableOnDevice, pushPermissionState, pushReady, router, setPushEnabled]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const item of watchlistItems) {
      const category = watchlistCategory(productMeta.get(item.productId));
      if (category) values.add(category);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [productMeta, watchlistItems]);

  const filterSupermarkets = selectedSupermarkets;

  const dealTypeCounts = useMemo<WatchlistDealTypeCounts>(() => {
    const counts: WatchlistDealTypeCounts = { realSavers: 0, fairDeals: 0, dodgyDeals: 0 };
    for (const item of watchlistItems) {
      const deal = watchlistItemDeal(item, itemCards, ["all"], undefined, "best");
      if (!deal || deal.isOnSpecial !== true) continue;
      const verdict = getAssessmentVerdict(deal);
      if (verdict === "Real Saver") counts.realSavers += 1;
      else if (verdict === "Fair Price") counts.fairDeals += 1;
      else if (verdict === "Dodgy Deal") counts.dodgyDeals += 1;
    }
    return counts;
  }, [itemCards, watchlistItems]);

  const onSpecialCount = useMemo(
    () => watchlistItems.reduce((count, item) => count + (watchlistItemDeal(item, itemCards, ["all"], undefined, "best")?.isOnSpecial === true ? 1 : 0), 0),
    [itemCards, watchlistItems],
  );

  const filteredItems = useMemo(
    () => sortWatchlistItems(
      watchlistItems.filter((item) => {
        const category = watchlistCategory(productMeta.get(item.productId));
        const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(category);
        const deals = itemCards.get(item.productId)?.currentDeals ?? [];
        const matchesSupermarket = selectedSupermarkets.includes("all") || deals.some((deal) => matchesAnySelectedStore(deal.store, selectedSupermarkets));
        return matchesCategory && matchesSupermarket;
      }),
      "best",
      itemCards,
      filterSupermarkets,
    ),
    [filterSupermarkets, itemCards, productMeta, selectedCategories, selectedSupermarkets, watchlistItems],
  );

  const dealTypeFilteredItems = useMemo(
    () => filteredItems.filter((item) => watchlistItemDealForFilter(
      item,
      itemCards,
      filterSupermarkets,
      selectedDealType,
    ) !== undefined),
    [filterSupermarkets, filteredItems, itemCards, selectedDealType],
  );

  const supermarkets = useMemo(() => {
    const labels = new Map<string, string>();
    for (const item of watchlistItems) {
      for (const deal of itemCards.get(item.productId)?.currentDeals ?? []) {
        const key = canonicalStoreKey(deal.store);
        if (key && !labels.has(key)) labels.set(key, STORE_DISPLAY_FALLBACK[key] ?? deal.store);
      }
    }
    return [...labels.entries()].sort(([, labelA], [, labelB]) => labelA.localeCompare(labelB));
  }, [itemCards, watchlistItems]);

  const viewStatusDescription = useMemo(() => {
    const supermarketScope = selectedSupermarkets.includes("all")
      ? "all supermarkets"
      : supermarkets
        .filter(([key]) => selectedSupermarkets.includes(key))
        .map(([, label]) => label)
        .join(", ");
    const dealTypeScope = selectedDealType === "all" ? "all deal types" : dealTypeFilterLabel(selectedDealType);
    return `showing ${supermarketScope} and ${dealTypeScope}`;
  }, [selectedDealType, selectedSupermarkets, supermarkets]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of watchlistItems) {
      const category = watchlistCategory(productMeta.get(item.productId));
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [productMeta, watchlistItems]);

  const toggleSupermarket = useCallback((key: string) => {
    setSelectedSupermarkets((current) => {
      if (key === "all") return ["all"];
      if (current.includes("all")) return [key];
      if (current.includes(key)) {
        const next = current.filter((value) => value !== key);
        return next.length > 0 ? next : ["all"];
      }
      return [...current, key];
    });
  }, []);

  const shareList = useMemo<ListRow>(() => ({
    id: "watchlist-share",
    user_id: user?.id ?? "",
    name: "Watchlist",
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
  }), [user?.id]);

  const shareItems = useMemo(() => new Map([[shareList.id, watchlistItems.map((entry) => entry.item)]]), [shareList.id, watchlistItems]);

  const removeProduct = useCallback(async (productId: string) => {
    const entry = watchlistItems.find((item) => item.productId === productId);
    if (!entry) return;
    try {
      const client = requireAccountsSupabaseClient();
      await Promise.all(entry.sourceItems.map((item) => removeItemFromList(client, item.list_id, productId)));
      window.dispatchEvent(new CustomEvent(LIST_MEMBERSHIP_CHANGED_EVENT, { detail: { source: "watchlist-page" } }));
      await reload(false);
    } catch (removeError) {
      setError(describeFetchError(removeError, "We couldn't remove that product."));
    }
  }, [reload, watchlistItems]);

  const clearWatchlist = useCallback(async () => {
    if (watchlistItems.length === 0 || isClearingWatchlist) return;
    setIsClearingWatchlist(true);
    setError(null);
    try {
      const client = requireAccountsSupabaseClient();
      await Promise.all(
        watchlistItems.flatMap((entry) => entry.sourceItems.map((item) => removeItemFromList(client, item.list_id, entry.productId))),
      );
      window.dispatchEvent(new CustomEvent(LIST_MEMBERSHIP_CHANGED_EVENT, { detail: { source: "watchlist-page" } }));
      setIsClearWatchlistSheetOpen(false);
      await reload(false);
    } catch (clearError) {
      void reload(false);
      setError(describeFetchError(clearError, "We couldn't clear your Watchlist."));
    } finally {
      setIsClearingWatchlist(false);
    }
  }, [isClearingWatchlist, reload, watchlistItems]);

  const activeItems = useMemo(
    () => dealTypeFilteredItems.filter((item) => watchlistItemDealForFilter(item, itemCards, filterSupermarkets, selectedDealType)?.isOnSpecial === true),
    [dealTypeFilteredItems, filterSupermarkets, itemCards, selectedDealType],
  );
  const inactiveItems = useMemo(
    () => dealTypeFilteredItems.filter((item) => watchlistItemDealForFilter(item, itemCards, filterSupermarkets, selectedDealType)?.isOnSpecial !== true),
    [dealTypeFilteredItems, filterSupermarkets, itemCards, selectedDealType],
  );
  const renderItem = (entry: WatchlistItem) => {
    const card = itemCards.get(entry.productId);
    const meta = productMeta.get(entry.productId);
    const deal = card ? watchlistItemDealForFilter(entry, itemCards, filterSupermarkets, selectedDealType) : undefined;
    const sourceItem = entry.sourceItems[0];
    const unreadUpdates = entry.sourceItems.flatMap((item) => unreadAlertsByListItem.get(`${item.list_id}:${item.id}`) ?? []);
    const isUnread = unreadUpdates.length > 0;
    const onDealAssessmentOpen = () => void Promise.all(entry.sourceItems.map((item) => markListItemViewed(item.list_id, item.id)));
    return (
      <motion.div
        key={entry.productId}
        layout
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        data-watchlist-product-id={entry.productId}
      >
        <UnreadListItem
          listId={sourceItem.list_id}
          productId={entry.productId}
          isUnread={isUnread}
          updateAriaLabel={`View ${unreadUpdates[0]?.product_name ?? meta?.name ?? "product"} update`}
          onUpdateClick={() => setSelectedWatchlistUpdate(unreadUpdates)}
        >
          {card && deal ? (
            <ListItemProductCard
              product={card}
              deal={deal}
              otherSpecialStores={deal.isOnSpecial ? otherSpecialStores(card, deal.store) : []}
              quantity={entry.item.quantity}
              onRemove={() => void removeProduct(entry.productId)}
              removeLabel={`Remove ${meta?.name ?? "product"} from Watchlist`}
              onDealAssessmentOpen={onDealAssessmentOpen}
              onAfterNotOnSpecial={() => void reload(false)}
            />
          ) : (
            <FallbackWatchlistRow label={meta?.name ?? "Product"} image={card?.image ?? meta?.image_url} onRemove={() => void removeProduct(entry.productId)} />
          )}
        </UnreadListItem>
      </motion.div>
    );
  };

  useEffect(() => {
    const productId = new URLSearchParams(window.location.search).get("productId");
    if (!productId || loadingWatchlist || !watchlistItems.some((item) => item.productId === productId)) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-watchlist-product-id="${CSS.escape(productId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.history.replaceState(window.history.state, "", "/lists");
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadingWatchlist, watchlistItems]);

  if (authLoading) {
    return <main className="flex flex-col gap-3 pb-8" />;
  }

  if (!user) {
    return (
      <main className="flex flex-col gap-4 pt-6 pb-8">
        <div className="mx-5 flex flex-col items-center gap-3 rounded-3xl bg-white py-10 text-center">
          <MascotImage src="/lists-login.webp" darkSrc="/lists-login-dark.webp" alt="Dodgy Deal mascot with an empty Watchlist" width={288} height={306} sizes="144px" preload unoptimized className="mascot-wave h-auto w-full max-w-[8.5rem]" />
          <p className="max-w-xs px-4 text-sm font-bold text-stone-700">Log in to save products and get notified when they go on special again.</p>
          <button type="button" onClick={() => openAuthSheet("Log in to save products to your Watchlist.")} className="dd-btn dd-btn-primary cursor-pointer">Log in or create an account</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-col gap-2 pb-24">
      <div className="watchlist-top-chrome pt-2">
        <WatchlistSummaryCard
          itemCount={watchlistItems.length}
          newPriceItemCount={newPriceItemCount}
          onSpecialCount={onSpecialCount}
          dealTypeCounts={dealTypeCounts}
          selectedDealType={selectedDealType}
          onDealTypeChange={setSelectedDealType}
          showNotificationSetup={Boolean(watchlistItems.length > 0 && pushAvailableOnDevice && (pushPermissionState !== null || pushReady) && !pushEnabled)}
          notificationPermissionDenied={pushPermissionState === "denied"}
          isSettingUpNotifications={isSettingUpNotifications}
          onSetupNotifications={() => void handleNotificationSetup()}
        />
      </div>

      <div className="watchlist-filter-bar">
        <div className="hide-scrollbar flex min-w-0 gap-1.5 overflow-x-auto px-5">
          <div className="shrink-0">
            <DealTypePicker value={selectedDealType} onChange={setSelectedDealType} />
          </div>
          <div className="shrink-0">
            <SupermarketPicker
              stores={supermarkets.map(([id, label]) => ({ id, label }))}
              selectedStoreIds={selectedSupermarkets}
              onToggleStore={toggleSupermarket}
            />
          </div>
          <div className="shrink-0">
            <CategoryPicker
              selectedCategories={selectedCategories}
              onChange={setSelectedCategories}
              availableCategories={categories}
              categoryCounts={categoryCounts}
              align="left"
            />
          </div>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {selectedCategories.length > 0 || selectedDealType !== "all" || !selectedSupermarkets.includes("all")
          ? `Showing ${dealTypeFilteredItems.length} of ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}; ${viewStatusDescription}.`
          : `Watching ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}; ${viewStatusDescription}.`}
      </div>

      {error && <ErrorState message="Something went wrong with your Watchlist." detail={error} onRetry={() => void reload()} />}

      <div className={`relative ${loadingWatchlist ? "min-h-[160px]" : ""}`}>
        <div className="pointer-events-none absolute inset-0 z-10"><LoadingMascot loading={loadingWatchlist} /></div>
        {!loadingWatchlist && !error && watchlistItems.length === 0 && (
          <div className="mx-5 flex flex-col items-center gap-2 rounded-3xl border border-stone-200/80 bg-white px-5 py-12 text-center">
            <MascotImage src="/lists-login.webp" darkSrc="/lists-login-dark.webp" alt="" width={288} height={306} sizes="128px" unoptimized className="mascot-wave mb-2 h-auto w-full max-w-[8rem]" />
            <h2 className="font-display text-lg font-extrabold text-stone-900">Your Watchlist is empty</h2>
            <p className="max-w-xs text-sm leading-5 text-stone-500">Tap the plus icon on any item to add it to your Watchlist. We&rsquo;ll alert you when it goes on special again at a better price.</p>
          </div>
        )}
        {!loadingWatchlist && !error && watchlistItems.length > 0 && selectedDealType === "all" && dealTypeFilteredItems.length === 0 && (
          <p className="mx-5 rounded-2xl bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">No Watchlist products match these filters.</p>
        )}
        {!loadingWatchlist && !error && dealTypeFilteredItems.length > 0 && (
          <div className="flex flex-col gap-2 px-5">
              <AnimatePresence initial={false} mode="popLayout">
                {activeItems.length > 0 && (
                  <motion.h2
                    key="on-special-heading"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="px-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-stone-400"
                  >
                    {dealTypeResultHeading(selectedDealType)}
                  </motion.h2>
                )}
                {activeItems.map((entry) => renderItem(entry))}
                {inactiveItems.length > 0 && (
                  <motion.div
                    key="not-on-special-heading"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="mt-3"
                  >
                    <button
                      type="button"
                      aria-expanded={isInactiveSectionExpanded}
                      aria-controls="watchlist-not-on-special-items"
                      onClick={() => setIsInactiveSectionExpanded((expanded) => !expanded)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-[12px] font-extrabold uppercase tracking-[0.12em] text-stone-400 transition-colors hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1"
                    >
                      <span>Not currently on special ({inactiveItems.length})</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isInactiveSectionExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                    <div id="watchlist-not-on-special-items">
                      <AnimatePresence initial={false}>
                        {isInactiveSectionExpanded && (
                          <motion.div
                            key="not-on-special-items"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="flex flex-col gap-2 overflow-hidden pt-1"
                          >
                            {inactiveItems.map((entry) => renderItem(entry))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>
        )}
      </div>

      {!loadingWatchlist && watchlistItems.length > 0 && (
        <div className="mx-5 pt-1">
          <button type="button" onClick={() => setIsClearWatchlistSheetOpen(true)} className="dd-btn dd-btn-outline-alert w-full cursor-pointer">
            Clear Watchlist
          </button>
        </div>
      )}

      <WatchlistUpdateSheet
        open={selectedWatchlistUpdate !== null}
        updates={selectedWatchlistUpdate ?? []}
        onClose={() => setSelectedWatchlistUpdate(null)}
        onOpenAssessment={() => {
          const update = selectedWatchlistUpdate?.[0];
          if (!update) return;
          setSelectedWatchlistUpdate(null);
          void markListItemViewed(update.list_id, update.list_item_id);
          router.push(`/deal/${encodeURIComponent(update.product_id)}/${encodeURIComponent(update.store_name)}`);
        }}
      />
      <ShareListsSheet open={isShareSheetOpen} lists={watchlistItems.length ? [shareList] : []} itemsByList={shareItems} productMeta={productMeta} lowestPriceByProduct={lowestPriceByProduct} onClose={() => setIsShareSheetOpen(false)} />
      <ClearWatchlistSheet
        open={isClearWatchlistSheetOpen}
        itemCount={watchlistItems.length}
        isClearing={isClearingWatchlist}
        onClear={() => void clearWatchlist()}
        onClose={() => setIsClearWatchlistSheetOpen(false)}
      />
    </main>
  );
}

function ClearWatchlistSheet({
  open,
  itemCount,
  isClearing,
  onClear,
  onClose,
}: {
  open: boolean;
  itemCount: number;
  isClearing: boolean;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close clear Watchlist confirmation"
              disabled={isClearing}
              onClick={onClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-watchlist-sheet-title"
              aria-describedby="clear-watchlist-sheet-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex min-h-[40vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="clear-watchlist-sheet-title" className="dd-type-sheet-title text-stone-900">Clear your Watchlist?</h2>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isClearing}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-3 px-5 py-5 pb-safe-sm">
                <p id="clear-watchlist-sheet-description" className="dd-type-body text-stone-600">
                  This will remove all {itemCount} {itemCount === 1 ? "item" : "items"} from your Watchlist. You can&apos;t undo this.
                </p>
                <div className="mt-auto flex flex-col gap-3 pt-4">
                  <button type="button" onClick={onClose} disabled={isClearing} className="dd-btn dd-btn-outline-muted w-full cursor-pointer">
                    Cancel
                  </button>
                  <button type="button" onClick={onClear} disabled={isClearing} className="dd-btn dd-btn-outline-alert w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">
                    {isClearing ? "Clearing Watchlist…" : "Clear Watchlist"}
                  </button>
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}

function WatchlistSummaryCard({
  itemCount,
  newPriceItemCount,
  onSpecialCount,
  dealTypeCounts,
  selectedDealType,
  onDealTypeChange,
  showNotificationSetup,
  notificationPermissionDenied,
  isSettingUpNotifications,
  onSetupNotifications,
}: {
  itemCount: number;
  newPriceItemCount: number;
  onSpecialCount: number;
  dealTypeCounts: WatchlistDealTypeCounts;
  selectedDealType: WatchlistDealTypeFilter;
  onDealTypeChange: (value: WatchlistDealTypeFilter) => void;
  showNotificationSetup: boolean;
  notificationPermissionDenied: boolean;
  isSettingUpNotifications: boolean;
  onSetupNotifications: () => void;
}) {
  const hasNewPrices = newPriceItemCount > 0;
  const isEmpty = itemCount === 0;

  return (
    <section className="mx-5 rounded-2xl border border-stone-200 bg-white px-4 py-4" aria-labelledby="watchlist-intro-title">
      <h1 id="watchlist-intro-title" className="mb-3 text-center text-base font-extrabold leading-6 text-stone-900">You&apos;re watching {itemCount} {itemCount === 1 ? "product" : "products"}</h1>
      {!isEmpty && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white" aria-label="Watchlist specials summary">
          <div className="overflow-hidden rounded-2xl" aria-label="Filter specials by deal type">
            <div className="border-b border-stone-200 px-3 py-3 text-center" aria-label={`${onSpecialCount} on special now`}>
              <p className="text-base font-extrabold leading-6 text-stone-900">{onSpecialCount} on special now</p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-stone-200 bg-stone-50 py-2">
              {([
                ["Real Saver", "Real Savers", dealTypeCounts.realSavers, "text-fair-700"],
                ["Fair Price", "Fair Deals", dealTypeCounts.fairDeals, "text-amber-700"],
                ["Dodgy Deal", "Dodgy Deals", dealTypeCounts.dodgyDeals, "text-alert-700"],
              ] as const).map(([filter, label, count, tone]) => {
                const isSelected = selectedDealType === filter;
                const isDisabled = count === 0;
                return (
                  <button
                    key={filter}
                    type="button"
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    aria-label={`${label}: ${count}${isDisabled ? ", no results" : ", show results"}`}
                    onClick={() => {
                      if (!isDisabled) onDealTypeChange(isSelected ? "all" : filter);
                    }}
                    className="flex min-w-0 flex-col items-center gap-0.5 px-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-inset disabled:cursor-default disabled:opacity-100"
                  >
                    <span className={`text-xl font-black leading-7 ${tone}`}>{count}</span>
                    <span className="dd-type-meta dd-type-meta-strong text-stone-600">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {hasNewPrices && (
            <div className="flex items-center gap-2 border-t border-stone-100 px-4 py-3 text-[13px] font-extrabold text-stone-900" aria-live="polite">
              <span className="h-2.5 w-2.5 rounded-full bg-fair-600" aria-hidden="true" />
              {newPriceItemCount} {newPriceItemCount === 1 ? "item" : "items"} with new prices
            </div>
          )}
          {showNotificationSetup && (
            <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-3">
              <p className="text-[12px] leading-4 text-stone-500">
                {notificationPermissionDenied ? "Notifications are off. Turn them on to get price alerts." : "Get an alert when prices change."}
              </p>
              <button type="button" onClick={onSetupNotifications} disabled={isSettingUpNotifications} className="shrink-0 text-[12px] font-extrabold text-ink-900 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-600 disabled:cursor-wait disabled:opacity-50">
                {isSettingUpNotifications ? "Opening…" : notificationPermissionDenied ? "Open Settings" : "Set up notifications"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FallbackWatchlistRow({ label, image, onRemove }: { label: string; image?: string | null; onRemove: () => void }) {
  return (
    <div className="flex min-h-[76px] items-stretch justify-between overflow-hidden rounded-xl border border-stone-200/80 bg-white grayscale opacity-60">
      {image && <div className="flex min-h-[76px] w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-l-xl rounded-r-none bg-stone-50"><ProductImage src={image} alt="" width={96} height={96} sizes="96px" loading="lazy" className="h-3/4 w-3/4 object-contain" /></div>}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 p-2">
        <span className="min-w-0 text-sm font-semibold text-stone-700">{label}<span className="mt-0.5 block text-xs font-medium text-stone-500">Currently unavailable</span></span>
        <button type="button" onClick={onRemove} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-stone-600 hover:bg-stone-100">Remove</button>
      </div>
    </div>
  );
}
