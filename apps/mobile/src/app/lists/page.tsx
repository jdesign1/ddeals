"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, Share, X } from "lucide-react";
import {
  CATEGORY_SECTIONS,
  canonicalStoreKey,
  describeFetchError,
  groupCategory,
  invalidateListsPageCache,
  loadListsPageData,
  LIST_MEMBERSHIP_CHANGED_EVENT,
  matchesAnySelectedStore,
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
import SearchBar from "@/components/SearchBar";
import ShareListsSheet from "@/components/ShareListsSheet";
import ListItemProductCard from "@/components/ListItemProductCard";
import UnreadListItem from "@/components/UnreadListItem";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from "motion/react";

type SortMode = "recent" | "discount";

interface WatchlistItem {
  productId: string;
  item: ListItemRow;
  sourceItems: ListItemRow[];
  addedAt: string;
}

interface WatchlistGroup {
  key: string;
  label: string;
  items: WatchlistItem[];
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

function itemDiscount(item: WatchlistItem, itemCards: Map<string, ProductCardData>, selectedSupermarkets: string[]): number {
  return itemDeal(item, itemCards, selectedSupermarkets)?.discountPercentage ?? 0;
}

function supermarketPriority(item: WatchlistItem, itemCards: Map<string, ProductCardData>, selectedSupermarkets: string[]): number {
  if (selectedSupermarkets.includes("all")) return 0;
  const deals = itemCards.get(item.productId)?.currentDeals ?? [];
  const priority = selectedSupermarkets.findIndex((supermarket) => deals.some((deal) => matchesAnySelectedStore(deal.store, [supermarket])));
  return priority === -1 ? selectedSupermarkets.length : priority;
}

function supermarketGroupPriority(key: string, selectedSupermarkets: string[]): number {
  if (key === "price-unavailable") return Number.MAX_SAFE_INTEGER;
  if (selectedSupermarkets.includes("all")) return 0;
  const priority = selectedSupermarkets.indexOf(key);
  return priority === -1 ? selectedSupermarkets.length : priority;
}

function sortItems(items: WatchlistItem[], sortMode: SortMode, itemCards: Map<string, ProductCardData>, selectedSupermarkets: string[]) {
  return [...items].sort((a, b) => {
    const supermarketDifference = supermarketPriority(a, itemCards, selectedSupermarkets) - supermarketPriority(b, itemCards, selectedSupermarkets);
    if (supermarketDifference !== 0) return supermarketDifference;
    if (sortMode === "discount") {
      const discountDifference = itemDiscount(b, itemCards, selectedSupermarkets) - itemDiscount(a, itemCards, selectedSupermarkets);
      if (discountDifference !== 0) return discountDifference;
    }
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });
}

function WatchlistGroupSection({
  group,
  itemCards,
  productMeta,
  selectedSupermarkets,
  unreadListItemKeys,
  markListItemViewed,
  removeProduct,
  reload,
  isCollapsed,
  onToggleCollapsed,
}: {
  group: WatchlistGroup;
  itemCards: Map<string, ProductCardData>;
  productMeta: Map<string, ListItemProductMeta>;
  selectedSupermarkets: string[];
  unreadListItemKeys: ReadonlySet<string>;
  markListItemViewed: (listId: string, listItemId: string) => Promise<void>;
  removeProduct: (productId: string) => Promise<void>;
  reload: (showLoading?: boolean) => Promise<void>;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const dragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion() ?? false;
  const longPressTimerRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const handleDragHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      setIsDragging(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
      dragControls.start(event);
    }, 320);
  }, [clearLongPress, dragControls]);

  const handleDragHandlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    clearLongPress();
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [clearLongPress]);

  const onSpecialItems = group.items.filter((entry) => itemDeal(entry, itemCards, selectedSupermarkets)?.isOnSpecial === true);
  const notOnSpecialItems = group.items.filter((entry) => itemDeal(entry, itemCards, selectedSupermarkets)?.isOnSpecial !== true);
  const renderItem = (entry: WatchlistItem) => {
    const card = itemCards.get(entry.productId);
    const meta = productMeta.get(entry.productId);
    const deal = card ? itemDeal(entry, itemCards, selectedSupermarkets) : undefined;
    const sourceItem = entry.sourceItems[0];
    const isUnread = entry.sourceItems.some((item) => unreadListItemKeys.has(`${item.list_id}:${item.id}`));
    const onViewed = () => void Promise.all(entry.sourceItems.map((item) => markListItemViewed(item.list_id, item.id)));
    return (
      <div key={entry.productId} data-watchlist-product-id={entry.productId}>
        <UnreadListItem listId={sourceItem.list_id} productId={entry.productId} isUnread={isUnread} onViewed={onViewed}>
          {card && deal ? (
            <ListItemProductCard product={card} deal={deal} quantity={entry.item.quantity} onRemove={() => void removeProduct(entry.productId)} removeLabel={`Remove ${meta?.name ?? "product"} from Watchlist`} onAfterNotOnSpecial={() => void reload(false)} />
          ) : (
            <FallbackWatchlistRow label={meta?.name ?? "Product"} onRemove={() => void removeProduct(entry.productId)} />
          )}
        </UnreadListItem>
      </div>
    );
  };

  return (
    <Reorder.Item
      value={group.key}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      layout="position"
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      whileDrag={prefersReducedMotion ? { zIndex: 10 } : { scale: 1.01, zIndex: 10 }}
      className="flex flex-col"
    >
      <motion.section
        animate={{
          borderColor: isDragging ? "var(--color-fair-600)" : "rgb(231 229 228)",
          rotate: isDragging && !prefersReducedMotion ? [-0.6, 0.6] : 0,
        }}
        transition={{
          borderColor: prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" },
          rotate: isDragging && !prefersReducedMotion
            ? { duration: 0.18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
            : { duration: prefersReducedMotion ? 0 : 0.12, ease: "easeOut" },
        }}
        className="rounded-2xl border border-stone-200 bg-white p-3"
        aria-labelledby={`watchlist-group-${group.key}`}
      >
        <div
          className={`${isCollapsed ? "mb-0" : "mb-3"} flex min-h-8 cursor-grab select-none items-center gap-3 touch-none active:cursor-grabbing`}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={handleDragHandlePointerDown}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerUp}
        >
          <h2 id={`watchlist-group-${group.key}`} className="min-w-0 flex-1 truncate text-[13px] font-extrabold uppercase tracking-[0.12em] text-stone-500">{group.label}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <span className="normal-case tracking-normal text-[12px] font-bold text-stone-400">
              {group.items.length} {group.items.length === 1 ? "item" : "items"}
            </span>
            <button
              type="button"
              aria-label={group.items.length === 0 ? `${group.label} has no items` : `${isCollapsed ? "Expand" : "Collapse"} ${group.label} items`}
              aria-expanded={!isCollapsed}
              onClick={onToggleCollapsed}
              onPointerDown={(event) => event.stopPropagation()}
              disabled={group.items.length === 0}
              className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:cursor-default disabled:opacity-50"
            >
              {isCollapsed ? <Plus className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-2">
                {onSpecialItems.map(renderItem)}
                {notOnSpecialItems.length > 0 && group.key !== "price-unavailable" && (
                  <h3 className="px-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-stone-400">Not on special</h3>
                )}
                {notOnSpecialItems.map(renderItem)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </Reorder.Item>
  );
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
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSupermarkets, setSelectedSupermarkets] = useState<string[]>(["all"]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [isSettingUpNotifications, setIsSettingUpNotifications] = useState(false);

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
      const category = groupCategory(productMeta.get(item.productId)?.category);
      if (category) values.add(category);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [productMeta, watchlistItems]);

  const filteredItems = useMemo(
    () => sortItems(
      watchlistItems.filter((item) => {
        const category = groupCategory(productMeta.get(item.productId)?.category);
        const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(category);
        return matchesCategory;
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

  const groups = useMemo<WatchlistGroup[]>(() => {
    const grouped = new Map<string, WatchlistItem[]>(supermarkets.map(([key]) => [key, []]));
    for (const item of filteredItems) {
      const deal = itemDeal(item, itemCards, selectedSupermarkets);
      const store = deal?.store ?? "Price unavailable";
      const key = deal ? canonicalStoreKey(store) : "price-unavailable";
      const existing = grouped.get(key) ?? [];
      existing.push(item);
      grouped.set(key, existing);
    }
    return [...grouped.entries()]
      .sort(([keyA], [keyB]) => {
        const priorityA = supermarketGroupPriority(keyA, selectedSupermarkets);
        const priorityB = supermarketGroupPriority(keyB, selectedSupermarkets);
        return priorityA !== priorityB ? priorityA - priorityB : keyA.localeCompare(keyB);
      })
      .map(([key, items]) => ({ key, label: key === "price-unavailable" ? "Not on special" : STORE_DISPLAY_FALLBACK[key] ?? itemDeal(items[0], itemCards, selectedSupermarkets)?.store ?? key, items }));
  }, [filteredItems, itemCards, selectedSupermarkets, supermarkets]);

  const orderedGroups = useMemo(() => {
    const groupsByKey = new Map(groups.map((group) => [group.key, group]));
    const rememberedKeys = groupOrder.filter((key) => groupsByKey.has(key));
    const newKeys = groups.map((group) => group.key).filter((key) => !groupOrder.includes(key));
    return [...rememberedKeys, ...newKeys].map((key) => groupsByKey.get(key)!);
  }, [groupOrder, groups]);

  const expandAllWatchlistGroups = useCallback(() => {
    setCollapsedGroupKeys([]);
  }, []);

  const toggleSupermarket = useCallback((key: string) => {
    expandAllWatchlistGroups();
    setSelectedSupermarkets((current) => {
      if (key === "all") return ["all"];
      if (current.includes("all")) return [key];
      if (current.includes(key)) {
        const next = current.filter((value) => value !== key);
        return next.length > 0 ? next : ["all"];
      }
      return [...current, key];
    });
  }, [expandAllWatchlistGroups]);

  const toggleCategory = useCallback((category: string) => {
    expandAllWatchlistGroups();
    setSelectedCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
  }, [expandAllWatchlistGroups]);

  const clearCategories = useCallback(() => {
    expandAllWatchlistGroups();
    setSelectedCategories([]);
  }, [expandAllWatchlistGroups]);

  const clearAllFilters = useCallback(() => {
    expandAllWatchlistGroups();
    setSelectedCategories([]);
    setSelectedSupermarkets(["all"]);
  }, [expandAllWatchlistGroups]);

  const selectSortMode = useCallback((value: string) => {
    expandAllWatchlistGroups();
    setSortMode(value as SortMode);
    setIsSortSheetOpen(false);
  }, [expandAllWatchlistGroups]);

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
    return <main className="flex flex-col gap-3 pb-8"><SearchBar variant="shadow" compact placeholder="Search for products to watch" sticky={false} backgroundClassName="page-paper-surface" /></main>;
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
    <main className="flex min-h-full flex-col gap-4 pb-24">
      <div className="watchlist-top-chrome">
        <div className="flex flex-col gap-4">
          <SearchBar variant="shadow" compact placeholder="Search for products to watch" sticky={false} backgroundClassName="page-paper-surface" />
          <WatchlistSummaryCard
            itemCount={watchlistItems.length}
            newPriceItemCount={newPriceItemCount}
            showNotificationSetup={Boolean(watchlistItems.length > 0 && pushAvailableOnDevice && (pushPermissionState !== null || pushReady) && !pushEnabled)}
            notificationPermissionDenied={pushPermissionState === "denied"}
            isSettingUpNotifications={isSettingUpNotifications}
            onSetupNotifications={() => void handleNotificationSetup()}
          />
        </div>
      </div>

      <div className="watchlist-filter-bar">
        <div className="flex items-center justify-start gap-3 px-5">
          <button type="button" onClick={() => setIsFilterSheetOpen(true)} disabled={watchlistItems.length === 0 || (categories.length <= 1 && supermarkets.length === 0)} aria-label={`Filter Watchlist${selectedCategories.length > 0 || !selectedSupermarkets.includes("all") ? ", filters active" : ""}`} className={`inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-stone-300 px-3 py-1.5 dd-type-control shadow-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selectedCategories.length > 0 || !selectedSupermarkets.includes("all") ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}><span>Filter</span></button>
          <button type="button" onClick={() => setIsSortSheetOpen(true)} disabled={watchlistItems.length === 0} aria-label={`Sort Watchlist, ${sortMode === "recent" ? "date added" : "largest discount"}`} className="inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-stone-300 bg-white px-3 py-1.5 dd-type-control text-stone-600 shadow-none transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"><span>Sort</span></button>
          <button type="button" onClick={() => setIsShareSheetOpen(true)} disabled={watchlistItems.length === 0} aria-label="Share Watchlist" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"><Share className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      </div>

      <div className="px-5 text-[13px] font-bold text-stone-600" aria-live="polite">
        {selectedCategories.length > 0
          ? `Showing ${filteredItems.length} of ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}`
          : `Watching ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}`}
        {sortMode === "discount" && <span className="font-medium text-stone-400"> · Largest discount first</span>}
        {sortMode === "recent" && <span className="font-medium text-stone-400"> · Newest first</span>}
      </div>

      {error && <ErrorState message="Something went wrong with your Watchlist." detail={error} onRetry={() => void reload()} />}

      <div className={`relative ${loadingWatchlist ? "min-h-[160px]" : ""}`}>
        <div className="pointer-events-none absolute inset-0 z-10"><LoadingMascot loading={loadingWatchlist} /></div>
        {!loadingWatchlist && !error && watchlistItems.length === 0 && (
          <div className="mx-5 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-12 text-center">
            <MascotImage src="/lists-login.webp" darkSrc="/lists-login-dark.webp" alt="" width={288} height={306} sizes="128px" unoptimized className="mascot-wave mb-2 h-auto w-full max-w-[8rem]" />
            <h2 className="font-display text-lg font-extrabold text-stone-900">Nothing saved yet</h2>
            <p className="max-w-xs text-sm leading-5 text-stone-500">Tap the plus icon on any product, select everything you want, then add it all at once.</p>
          </div>
        )}
        {!loadingWatchlist && !error && watchlistItems.length > 0 && filteredItems.length === 0 && (
          <p className="mx-5 rounded-2xl bg-white px-4 py-8 text-center text-sm font-semibold text-stone-500">No Watchlist products match this category.</p>
        )}
        {!loadingWatchlist && !error && filteredItems.length > 0 && (
          <Reorder.Group axis="y" values={orderedGroups.map((group) => group.key)} onReorder={setGroupOrder} className="flex flex-col gap-5 px-5">
            {orderedGroups.map((group) => (
              <WatchlistGroupSection
                key={group.key}
                group={group}
                itemCards={itemCards}
                productMeta={productMeta}
                selectedSupermarkets={selectedSupermarkets}
                unreadListItemKeys={unreadListItemKeys}
                markListItemViewed={markListItemViewed}
                removeProduct={removeProduct}
                reload={reload}
                isCollapsed={group.items.length === 0 || collapsedGroupKeys.includes(group.key)}
                onToggleCollapsed={() => {
                  if (group.items.length === 0) return;
                  setCollapsedGroupKeys((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key]);
                }}
              />
            ))}
          </Reorder.Group>
        )}
      </div>

      <ShareListsSheet open={isShareSheetOpen} lists={watchlistItems.length ? [shareList] : []} itemsByList={shareItems} productMeta={productMeta} lowestPriceByProduct={lowestPriceByProduct} onClose={() => setIsShareSheetOpen(false)} />
      <WatchlistFilterSheet
        open={isFilterSheetOpen}
        availableCategories={categories}
        selectedCategories={selectedCategories}
        supermarkets={supermarkets}
        selectedSupermarkets={selectedSupermarkets}
        onToggle={toggleSupermarket}
        onToggleCategory={toggleCategory}
        onClearCategories={clearCategories}
        onClearAll={clearAllFilters}
        onClose={() => setIsFilterSheetOpen(false)}
      />
      <WatchlistOptionSheet
        open={isSortSheetOpen}
        title="Sort Watchlist"
        selectedValue={sortMode}
        options={[{ value: "recent", label: "Date added" }, { value: "discount", label: "Largest discount" }]}
        onSelect={selectSortMode}
        onClose={() => setIsSortSheetOpen(false)}
      />
    </main>
  );
}

function WatchlistSummaryCard({
  itemCount,
  newPriceItemCount,
  showNotificationSetup,
  notificationPermissionDenied,
  isSettingUpNotifications,
  onSetupNotifications,
}: {
  itemCount: number;
  newPriceItemCount: number;
  showNotificationSetup: boolean;
  notificationPermissionDenied: boolean;
  isSettingUpNotifications: boolean;
  onSetupNotifications: () => void;
}) {
  const hasNewPrices = newPriceItemCount > 0;
  const isEmpty = itemCount === 0;

  return (
    <section className="mx-5 rounded-2xl border border-stone-200 bg-white px-4 py-4" aria-labelledby="watchlist-intro-title">
      <div className="flex items-center justify-between gap-3">
        <h1 id="watchlist-intro-title" className="font-display text-lg font-extrabold text-stone-900">Your Watchlist</h1>
        {!isEmpty && (
          <div className={`flex shrink-0 items-center gap-2 pt-0.5 text-right text-[13px] font-extrabold ${hasNewPrices ? "text-stone-900" : "text-stone-500"}`} aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${hasNewPrices ? "bg-fair-600" : "bg-stone-300"}`} aria-hidden="true" />
            {hasNewPrices ? `${newPriceItemCount} ${newPriceItemCount === 1 ? "item" : "items"} with new prices` : "No new prices yet"}
          </div>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-5 text-stone-600">
        {isEmpty
          ? "Save items to your Watchlist and we’ll keep an eye out for better special prices."
          : hasNewPrices
            ? "New prices are ready to review. Check the highlighted items below."
            : "We’ll keep an eye out for a better special price and let you know when your items improve."}
      </p>
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

function FallbackWatchlistRow({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/80 bg-white px-3 py-3 grayscale opacity-60"><span className="min-w-0 text-sm font-semibold text-stone-700">{label}<span className="mt-0.5 block text-xs font-medium text-stone-500">Currently unavailable</span></span><button type="button" onClick={onRemove} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-stone-600 hover:bg-stone-100">Remove</button></div>;
}

function WatchlistFilterSheet({
  open,
  availableCategories,
  selectedCategories,
  supermarkets,
  selectedSupermarkets,
  onToggleCategory,
  onToggle,
  onClearCategories,
  onClearAll,
  onClose,
}: {
  open: boolean;
  availableCategories: string[];
  selectedCategories: string[];
  supermarkets: Array<[string, string]>;
  selectedSupermarkets: string[];
  onToggleCategory: (category: string) => void;
  onToggle: (key: string) => void;
  onClearCategories: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const curatedCategories = new Set(CATEGORY_SECTIONS.flatMap((section) => section.categories));
  const otherCategories = availableCategories.filter((category) => !curatedCategories.has(category));
  const allSupermarketsSelected = selectedSupermarkets.includes("all");
  const hasActiveFilters = selectedCategories.length > 0 || !allSupermarketsSelected;

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 220 }} className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl">
            <div className="dd-bottom-sheet-titlebar flex shrink-0 items-center justify-between border-b border-stone-100 px-5 pb-3 pt-4">
              <h3 className="dd-type-sheet-title text-stone-900">Filter</h3>
              <div className="flex items-center gap-1">
                {hasActiveFilters && <button type="button" onClick={onClearAll} className="px-2 py-1 dd-type-control text-ink-600 hover:text-ink-800 hover:underline">Clear all</button>}
                <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
            <div className="space-y-7 overflow-y-auto px-5 py-4">
              <section aria-labelledby="watchlist-filter-categories-title" className="space-y-4">
                <h4 id="watchlist-filter-categories-title" className="dd-type-sheet-title text-stone-900">Categories</h4>
                <button type="button" aria-pressed={selectedCategories.length === 0} onClick={onClearCategories} className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${selectedCategories.length === 0 ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white" : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"}`}>All categories</button>
                {CATEGORY_SECTIONS.map((section) => {
                  const sectionCategories = section.categories.filter((category) => availableCategories.includes(category));
                  if (sectionCategories.length === 0) return null;
                  return (
                    <div key={section.title} className="space-y-2">
                      <h5 className="dd-type-meta dd-type-meta-strong text-stone-500">{section.title}</h5>
                      <div className="flex flex-wrap gap-2">
                        {sectionCategories.map((category) => {
                          const selected = selectedCategories.includes(category);
                          return <button key={category} type="button" aria-pressed={selected} onClick={() => onToggleCategory(category)} className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${selected ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white" : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"}`}>{category}</button>;
                        })}
                      </div>
                    </div>
                  );
                })}
                {otherCategories.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="dd-type-meta dd-type-meta-strong text-stone-500">Other</h5>
                    <div className="flex flex-wrap gap-2">
                      {otherCategories.map((category) => {
                        const selected = selectedCategories.includes(category);
                        return <button key={category} type="button" aria-pressed={selected} onClick={() => onToggleCategory(category)} className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${selected ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white" : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"}`}>{category}</button>;
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section aria-labelledby="watchlist-filter-supermarkets-title" className="space-y-3 border-t border-stone-100 pt-5">
                <h4 id="watchlist-filter-supermarkets-title" className="dd-type-sheet-title text-stone-900">Supermarkets</h4>
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={allSupermarketsSelected} onClick={() => onToggle("all")} className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${allSupermarketsSelected ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white" : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"}`}>All supermarkets</button>
                  {supermarkets.map(([key, label]) => {
                    const selected = selectedSupermarkets.includes(key);
                    return <button key={key} type="button" aria-pressed={selected} onClick={() => onToggle(key)} className={`dd-category-sheet-pill rounded-full px-3 py-2 dd-type-control shadow-sm transition-colors ${selected ? "dd-category-sheet-pill-selected cursor-pointer bg-ink-600 text-white" : "cursor-pointer bg-white text-stone-600 hover:bg-stone-50"}`}>{label}</button>;
                  })}
                </div>
              </section>
            </div>
            <div className="dd-sheet-cta-footer shrink-0 border-t border-stone-100 px-5 pt-3">
              <button type="button" onClick={onClose} className="dd-sheet-cta w-full rounded-xl bg-stone-900 py-3 dd-type-control text-white transition-colors hover:bg-ink-600">Done</button>
            </div>
          </motion.div>
        </>}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}

function WatchlistOptionSheet({
  open,
  title,
  selectedValue,
  options,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  selectedValue: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && <>
          <motion.button type="button" aria-label={`Close ${title}`} onClick={onClose} className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.section role="dialog" aria-modal="true" aria-labelledby="watchlist-option-sheet-title" className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto flex max-h-[72dvh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 220 }}>
            <div className="dd-bottom-sheet-titlebar flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4"><h3 id="watchlist-option-sheet-title" className="dd-type-sheet-title text-stone-900">{title}</h3><button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100"><X className="h-4 w-4" aria-hidden="true" /></button></div>
            <div className="flex flex-col gap-2 overflow-y-auto px-5 py-4 pb-safe-sm">
              {options.map(({ value, label }) => <button key={value} type="button" aria-pressed={selectedValue === value} onClick={() => onSelect(value)} className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-left text-sm font-bold transition-colors ${selectedValue === value ? "bg-ink-900 text-white" : "bg-stone-50 text-stone-700 hover:bg-stone-100"}`}><span>{label}</span>{selectedValue === value && <Check className="h-4 w-4" aria-hidden="true" />}</button>)}
            </div>
          </motion.section>
        </>}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
