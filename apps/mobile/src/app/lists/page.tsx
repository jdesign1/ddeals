"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  canonicalStoreKey,
  describeFetchError,
  findCheaperAlternatives,
  groupCategory,
  getSearchSynonymRule,
  invalidateListsPageCache,
  loadLiveProducts,
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
import { useNotifications } from "@/lib/notifications-context";
import ErrorState from "@/components/ErrorState";
import LoadingMascot from "@/components/LoadingMascot";
import MascotImage from "@/components/MascotImage";
import ProductImage from "@/components/ProductImage";
import ShareListsSheet from "@/components/ShareListsSheet";
import ListItemProductCard from "@/components/ListItemProductCard";
import UnreadListItem from "@/components/UnreadListItem";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import CategoryPicker from "@/components/CategoryPicker";
import SortDropdown from "@/components/SortDropdown";
import SupermarketPicker from "@/components/SupermarketPicker";
import { AnimatePresence, motion } from "motion/react";
import { WATCHLIST_SHARE_EVENT } from "@/lib/watchlist-events";

type SortMode = "best" | "dodgy" | "recent";
type WatchlistTab = "watchlist" | "cheaper-options";

interface WatchlistItem {
  productId: string;
  item: ListItemRow;
  sourceItems: ListItemRow[];
  addedAt: string;
}

const dairyRule = getSearchSynonymRule("dairy");

function watchlistCategory(product: Pick<ListItemProductMeta, "name" | "brand" | "category"> | undefined): string {
  if (!product) return "";
  const isDairy = dairyRule ? productMatchesSynonymRule(dairyRule, product) : false;
  return isDairy ? "Dairy" : groupCategory(product.category);
}

function itemDeal(item: WatchlistItem, itemCards: Map<string, ProductCardData>, selectedSupermarkets: string[]) {
  const deals = itemCards.get(item.productId)?.currentDeals ?? [];
  if (selectedSupermarkets.includes("all")) return deals[0];
  for (const supermarket of selectedSupermarkets) {
    const preferredDeal = deals.find((deal) => matchesAnySelectedStore(deal.store, [supermarket]));
    if (preferredDeal) return preferredDeal;
  }
  return deals[0];
}

function otherSpecialStoreCount(product: ProductCardData, displayedStore: string): number {
  const displayedKey = canonicalStoreKey(displayedStore);
  return new Set(
    product.currentDeals
      .filter((deal) => deal.isOnSpecial && canonicalStoreKey(deal.store) !== displayedKey)
      .map((deal) => canonicalStoreKey(deal.store)),
  ).size;
}

function sortItems(items: WatchlistItem[], sortMode: SortMode, itemCards: Map<string, ProductCardData>, selectedSupermarkets: string[]) {
  return [...items].sort((a, b) => {
    const dealA = itemDeal(a, itemCards, selectedSupermarkets);
    const dealB = itemDeal(b, itemCards, selectedSupermarkets);
    const inactiveDifference = Number(dealA?.isOnSpecial !== true) - Number(dealB?.isOnSpecial !== true);
    if (inactiveDifference !== 0) return inactiveDifference;
    if (sortMode === "best") {
      const realSaverDifference = Number(dealB?.dealType === "Real Deal") - Number(dealA?.dealType === "Real Deal");
      if (realSaverDifference !== 0) return realSaverDifference;
      const discountDifference = (dealB?.discountPercentage ?? 0) - (dealA?.discountPercentage ?? 0);
      if (discountDifference !== 0) return discountDifference;
    } else if (sortMode === "dodgy") {
      const dodgyDifference = Number(dealB?.dealType === "Dodgy Deal" || dealB?.isDodgyReviewCandidate === true) - Number(dealA?.dealType === "Dodgy Deal" || dealA?.isDodgyReviewCandidate === true);
      if (dodgyDifference !== 0) return dodgyDifference;
      const priceIncreaseDifference = ((dealB?.price ?? 0) - (dealB?.originalPrice ?? dealB?.price ?? 0)) - ((dealA?.price ?? 0) - (dealA?.originalPrice ?? dealA?.price ?? 0));
      if (priceIncreaseDifference !== 0) return priceIncreaseDifference;
    }
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });
}

export default function ListsPage() {
  const { user, loading: authLoading, openAuthSheet } = useAuth();
  const router = useRouter();
  const {
    unreadListItemKeys,
    markListItemViewed,
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
  const [sortMode, setSortMode] = useState<SortMode>("best");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSupermarkets, setSelectedSupermarkets] = useState<string[]>(["all"]);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [isClearWatchlistSheetOpen, setIsClearWatchlistSheetOpen] = useState(false);
  const [isClearingWatchlist, setIsClearingWatchlist] = useState(false);
  const [isSettingUpNotifications, setIsSettingUpNotifications] = useState(false);
  const [activeWatchlistTab, setActiveWatchlistTab] = useState<WatchlistTab>("watchlist");
  const [catalogueProducts, setCatalogueProducts] = useState<ProductCardData[] | null>(null);
  const [loadingCheaperOptions, setLoadingCheaperOptions] = useState(false);
  const [cheaperOptionsError, setCheaperOptionsError] = useState<string | null>(null);
  const [expandedCheaperProductIds, setExpandedCheaperProductIds] = useState<Set<string>>(new Set());

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

  const loadCheaperOptions = useCallback(() => {
    if (catalogueProducts !== null || loadingCheaperOptions) return;
    setLoadingCheaperOptions(true);
    setCheaperOptionsError(null);
    void loadLiveProducts(supabaseConfig)
      .then((products) => setCatalogueProducts(products))
      .catch((loadError) => setCheaperOptionsError(describeFetchError(loadError, "We couldn't load cheaper options.")))
      .finally(() => setLoadingCheaperOptions(false));
  }, [catalogueProducts, loadingCheaperOptions]);

  const handleWatchlistTabChange = useCallback((tab: WatchlistTab) => {
    setActiveWatchlistTab(tab);
    if (tab === "cheaper-options") {
      loadCheaperOptions();
    } else {
      setExpandedCheaperProductIds(new Set());
    }
  }, [loadCheaperOptions]);

  const toggleCheaperOptions = useCallback((productId: string) => {
    setExpandedCheaperProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
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

  const filteredItems = useMemo(
    () => sortItems(
      watchlistItems.filter((item) => {
        const category = watchlistCategory(productMeta.get(item.productId));
        const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(category);
        const deals = itemCards.get(item.productId)?.currentDeals ?? [];
        const matchesSupermarket = selectedSupermarkets.includes("all") || deals.some((deal) => matchesAnySelectedStore(deal.store, selectedSupermarkets));
        return matchesCategory && matchesSupermarket;
      }),
      sortMode,
      itemCards,
      selectedSupermarkets,
    ),
    [itemCards, productMeta, selectedCategories, selectedSupermarkets, sortMode, watchlistItems],
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
    () => filteredItems.filter((item) => itemDeal(item, itemCards, selectedSupermarkets)?.isOnSpecial === true),
    [filteredItems, itemCards, selectedSupermarkets],
  );
  const inactiveItems = useMemo(
    () => filteredItems.filter((item) => itemDeal(item, itemCards, selectedSupermarkets)?.isOnSpecial !== true),
    [filteredItems, itemCards, selectedSupermarkets],
  );
  const cheaperAlternativesByProduct = useMemo(() => {
    if (activeWatchlistTab !== "cheaper-options" || !catalogueProducts) return new Map<string, ReturnType<typeof findCheaperAlternatives>>();
    const alternatives = new Map<string, ReturnType<typeof findCheaperAlternatives>>();
    for (const item of filteredItems) {
      const card = itemCards.get(item.productId);
      const deal = card ? itemDeal(item, itemCards, selectedSupermarkets) : undefined;
      if (card && deal) alternatives.set(item.productId, findCheaperAlternatives(card, catalogueProducts, deal.price, ["all"]).slice(0, 5));
    }
    return alternatives;
  }, [activeWatchlistTab, catalogueProducts, filteredItems, itemCards, selectedSupermarkets]);
  const renderItem = (entry: WatchlistItem) => {
    const card = itemCards.get(entry.productId);
    const meta = productMeta.get(entry.productId);
    const deal = card ? itemDeal(entry, itemCards, selectedSupermarkets) : undefined;
    const sourceItem = entry.sourceItems[0];
    const isUnread = entry.sourceItems.some((item) => unreadListItemKeys.has(`${item.list_id}:${item.id}`));
    const onViewed = () => void Promise.all(entry.sourceItems.map((item) => markListItemViewed(item.list_id, item.id)));
    const cheaperAlternatives = cheaperAlternativesByProduct.get(entry.productId) ?? [];
    return (
      <div key={entry.productId} data-watchlist-product-id={entry.productId}>
        <UnreadListItem listId={sourceItem.list_id} productId={entry.productId} isUnread={isUnread} onViewed={onViewed}>
          {card && deal ? (
            <ListItemProductCard
              product={card}
              deal={deal}
              otherSpecialCount={deal.isOnSpecial ? otherSpecialStoreCount(card, deal.store) : 0}
              quantity={entry.item.quantity}
              onRemove={() => void removeProduct(entry.productId)}
              removeLabel={`Remove ${meta?.name ?? "product"} from Watchlist`}
              onAfterNotOnSpecial={() => void reload(false)}
              showCheaperOptions={activeWatchlistTab === "cheaper-options"}
              cheaperAlternatives={cheaperAlternatives}
              cheaperOptionsExpanded={expandedCheaperProductIds.has(entry.productId)}
              onToggleCheaperOptions={() => toggleCheaperOptions(entry.productId)}
              cheaperOptionsLoading={loadingCheaperOptions && catalogueProducts === null}
              cheaperOptionsError={cheaperOptionsError}
            />
          ) : (
            <FallbackWatchlistRow label={meta?.name ?? "Product"} image={card?.image ?? meta?.image_url} onRemove={() => void removeProduct(entry.productId)} />
          )}
        </UnreadListItem>
      </div>
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
          activeTab={activeWatchlistTab}
          onTabChange={handleWatchlistTabChange}
          itemCount={watchlistItems.length}
          newPriceItemCount={newPriceItemCount}
          showNotificationSetup={Boolean(watchlistItems.length > 0 && pushAvailableOnDevice && (pushPermissionState !== null || pushReady) && !pushEnabled)}
          notificationPermissionDenied={pushPermissionState === "denied"}
          isSettingUpNotifications={isSettingUpNotifications}
          onSetupNotifications={() => void handleNotificationSetup()}
        />
      </div>

      <div className="watchlist-filter-bar">
        <div className="grid min-w-0 grid-cols-[minmax(0,1.35fr)_minmax(0,1.1fr)_minmax(0,0.65fr)] gap-1.5 overflow-hidden px-5">
          <SupermarketPicker
            stores={supermarkets.map(([id, label]) => ({ id, label }))}
            selectedStoreIds={selectedSupermarkets}
            onToggleStore={toggleSupermarket}
          />
          <CategoryPicker
            selectedCategories={selectedCategories}
            onChange={setSelectedCategories}
            availableCategories={categories}
            categoryCounts={categoryCounts}
          />
          <SortDropdown
            value={sortMode}
            defaultValue="best"
            onChange={setSortMode}
            options={[
              { value: "best" as const, label: "Best deals first" },
              { value: "dodgy" as const, label: "Dodgy deals first" },
              { value: "recent" as const, label: "Latest added" },
            ]}
            fill
          />
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {selectedCategories.length > 0
          ? `Showing ${filteredItems.length} of ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}`
          : `Watching ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}`}
      </div>

      {error && <ErrorState message="Something went wrong with your Watchlist." detail={error} onRetry={() => void reload()} />}

      <div className="mx-5 pt-1">
        <p className="text-sm font-extrabold text-stone-900">
          {watchlistItems.length} {watchlistItems.length === 1 ? "item" : "items"}
        </p>
      </div>

      <div className={`relative ${loadingWatchlist ? "min-h-[160px]" : ""}`}>
        <div className="pointer-events-none absolute inset-0 z-10"><LoadingMascot loading={loadingWatchlist} /></div>
        {!loadingWatchlist && !error && watchlistItems.length === 0 && (
          <div className="mx-5 flex flex-col items-center gap-2 rounded-3xl border border-stone-200/80 bg-white px-5 py-12 text-center">
            <MascotImage src="/lists-login.webp" darkSrc="/lists-login-dark.webp" alt="" width={288} height={306} sizes="128px" unoptimized className="mascot-wave mb-2 h-auto w-full max-w-[8rem]" />
            <h2 className="font-display text-lg font-extrabold text-stone-900">Your Watchlist is empty</h2>
            <p className="max-w-xs text-sm leading-5 text-stone-500">Tap the plus icon on any item to add it to your Watchlist. We&rsquo;ll alert you when it goes on special again at a better price.</p>
          </div>
        )}
        {!loadingWatchlist && !error && watchlistItems.length > 0 && filteredItems.length === 0 && (
          <p className="mx-5 rounded-2xl bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">No Watchlist products match these filters.</p>
        )}
        {!loadingWatchlist && !error && filteredItems.length > 0 && (
          <div className="flex flex-col gap-2 px-5">
            {activeItems.map(renderItem)}
            {inactiveItems.length > 0 && (
              <h2 className="mt-3 px-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-stone-400">Not on special</h2>
            )}
            {inactiveItems.map(renderItem)}
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
  activeTab,
  onTabChange,
  itemCount,
  newPriceItemCount,
  showNotificationSetup,
  notificationPermissionDenied,
  isSettingUpNotifications,
  onSetupNotifications,
}: {
  activeTab: WatchlistTab;
  onTabChange: (tab: WatchlistTab) => void;
  itemCount: number;
  newPriceItemCount: number;
  showNotificationSetup: boolean;
  notificationPermissionDenied: boolean;
  isSettingUpNotifications: boolean;
  onSetupNotifications: () => void;
}) {
  const hasNewPrices = newPriceItemCount > 0;
  const isEmpty = itemCount === 0;
  const subtitle = isEmpty
    ? "Save items to your Watchlist and we’ll keep an eye out for better special prices."
    : activeTab === "cheaper-options"
      ? "Browse cheaper specials for the products you’re watching."
      : "Below are the best specials currently available for the products you’re watching.";

  return (
    <section className="mx-5 rounded-2xl border border-stone-200 bg-white px-4 py-4" aria-labelledby="watchlist-intro-title">
      <div
        className="dd-segmented-control flex h-11 w-full items-center gap-0.5 rounded-full bg-stone-100 p-0.5 shadow-sm shadow-black/5"
        role="tablist"
        aria-label="Watchlist views"
      >
        {([
          ["watchlist", "Watchlist"],
          ["cheaper-options", "Cheaper Options"],
        ] as const).map(([tab, label]) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab)}
              className={[
                "relative z-0 flex h-10 flex-1 items-center justify-center rounded-full px-3 text-center text-[13px] font-extrabold transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1",
                isActive
                  ? "dd-segmented-control-active bg-ink-900 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>
      <h1 id="watchlist-intro-title" className="sr-only">Your Watchlist</h1>
      <p className="mt-3 text-[13px] leading-5 text-stone-600">
        {subtitle}
      </p>
      {!isEmpty && hasNewPrices && (
        <div className="mt-2 flex items-center gap-2 text-[13px] font-extrabold text-stone-900" aria-live="polite">
          <span className="h-2.5 w-2.5 rounded-full bg-fair-600" aria-hidden="true" />
          {newPriceItemCount} {newPriceItemCount === 1 ? "item" : "items"} with new prices
        </div>
      )}
      {showNotificationSetup && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-3">
          <p className="text-[12px] leading-4 text-stone-500">
            {notificationPermissionDenied ? "Notifications are off. Turn them on to get price alerts." : "Get an alert when prices change."}
          </p>
          <button type="button" onClick={onSetupNotifications} disabled={isSettingUpNotifications} className="shrink-0 text-[12px] font-extrabold text-ink-900 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-600 disabled:cursor-wait disabled:opacity-50">
            {isSettingUpNotifications ? "Opening…" : notificationPermissionDenied ? "Open Settings" : "Set up notifications"}
          </button>
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
