"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import {
  canonicalStoreKey,
  describeFetchError,
  findCheaperAlternatives,
  groupCategory,
  getAssessmentVerdict,
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
import WatchlistViewPicker from "@/components/WatchlistViewPicker";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import { WATCHLIST_SHARE_EVENT } from "@/lib/watchlist-events";
import { consumeWatchlistReturnContext, type WatchlistReturnContext } from "@/lib/watchlist-navigation";
import { buildWatchlistPulse, type WatchlistPulseKind, type WatchlistPulseSummary } from "@/lib/watchlist-pulse";
import { sortWatchlistItems, watchlistItemDeal, type WatchlistSortMode } from "@/lib/watchlist-sort";

type WatchlistTab = "watchlist" | "cheaper-options";
type WatchlistView = "all" | "by-supermarket";

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

type CheaperAlternativeList = ReturnType<typeof findCheaperAlternatives>;
type CheaperAlternativeCacheEntry = {
  contextKey: string;
  alternatives: CheaperAlternativeList;
};

function cheaperOptionsContextKey(product: ProductCardData, deal: ReturnType<typeof watchlistItemDeal>): string {
  return deal
    ? [product.id, product.name, product.brand, product.category, canonicalStoreKey(deal.store), deal.price].join(":")
    : "";
}

function otherSpecialStoreCount(product: ProductCardData, displayedStore: string): number {
  const displayedKey = canonicalStoreKey(displayedStore);
  return new Set(
    product.currentDeals
      .filter((deal) => deal.isOnSpecial && canonicalStoreKey(deal.store) !== displayedKey)
      .map((deal) => canonicalStoreKey(deal.store)),
  ).size;
}

const WATCHLIST_STORE_ORDER_KEY = "dodgey-deals:watchlist-store-order";

const WATCHLIST_PULSE_ORDER: WatchlistPulseKind[] = [
  "real-savers",
  "dodgy-deals",
  "back-on-special",
  "price-drops",
  "cheaper-elsewhere",
];

function pulseLabel(kind: WatchlistPulseKind, count: number): string {
  if (kind === "real-savers") return `${count} Real Saver${count === 1 ? "" : "s"}`;
  if (kind === "dodgy-deals") return `${count} Dodgy Deal${count === 1 ? "" : "s"}`;
  if (kind === "back-on-special") return `${count} Back on special`;
  if (kind === "price-drops") return `${count} Price drop${count === 1 ? "" : "s"}`;
  return `${count} Cheaper elsewhere`;
}

function normalizeStoreOrder(savedOrder: string[], currentKeys: string[]): string[] {
  const current = new Set(currentKeys);
  const ordered = savedOrder.filter((key, index) => current.has(key) && savedOrder.indexOf(key) === index);
  return [...ordered, ...currentKeys.filter((key) => !ordered.includes(key))];
}

export default function ListsPage() {
  const { user, loading: authLoading, openAuthSheet } = useAuth();
  const router = useRouter();
  const {
    unreadListItemKeys,
    unreadAlerts,
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
  const [sortMode, setSortMode] = useState<WatchlistSortMode>("best");
  const [watchlistView, setWatchlistView] = useState<WatchlistView>("all");
  const [activePulse, setActivePulse] = useState<WatchlistPulseKind | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSupermarkets, setSelectedSupermarkets] = useState<string[]>(["all"]);
  const [expandedStoreKeys, setExpandedStoreKeys] = useState<Set<string>>(new Set());
  const [orderedStoreKeys, setOrderedStoreKeys] = useState<string[]>([]);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [isClearWatchlistSheetOpen, setIsClearWatchlistSheetOpen] = useState(false);
  const [isClearingWatchlist, setIsClearingWatchlist] = useState(false);
  const [isSettingUpNotifications, setIsSettingUpNotifications] = useState(false);
  const [activeWatchlistTab, setActiveWatchlistTab] = useState<WatchlistTab>("watchlist");
  const [catalogueProducts, setCatalogueProducts] = useState<ProductCardData[] | null>(null);
  const [loadingCheaperOptions, setLoadingCheaperOptions] = useState(false);
  const [cheaperOptionsError, setCheaperOptionsError] = useState<string | null>(null);
  const [cheaperAlternativesCache, setCheaperAlternativesCache] = useState<Map<string, CheaperAlternativeCacheEntry>>(new Map());
  const [loadingCheaperProductIds, setLoadingCheaperProductIds] = useState<Set<string>>(new Set());
  const [expandedCheaperProductIds, setExpandedCheaperProductIds] = useState<Set<string>>(new Set());
  const watchlistReturnContextRef = useRef<WatchlistReturnContext | null>(null);
  const watchlistReturnRestoredRef = useRef(false);
  const storeOrderHydratedRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!user || loadingWatchlist || error || watchlistItems.length === 0 || catalogueProducts !== null || loadingCheaperOptions) return;
    const timer = window.setTimeout(() => loadCheaperOptions(), 400);
    return () => window.clearTimeout(timer);
  }, [catalogueProducts, error, loadCheaperOptions, loadingCheaperOptions, loadingWatchlist, user, watchlistItems.length]);

  const prepareCheaperOptions = useCallback((productId: string) => {
    if (!catalogueProducts || loadingCheaperProductIds.has(productId)) return;
    const item = watchlistItems.find((entry) => entry.productId === productId);
    const card = itemCards.get(productId);
    const deal = item ? watchlistItemDeal(item, itemCards, selectedSupermarkets, undefined, sortMode) : undefined;
    if (!card || !deal) return;

    const contextKey = cheaperOptionsContextKey(card, deal);
    const cached = cheaperAlternativesCache.get(productId);
    if (cached?.contextKey === contextKey) return;

    setLoadingCheaperProductIds((current) => {
      const next = new Set(current);
      next.add(productId);
      return next;
    });

    window.setTimeout(() => {
      const alternatives = findCheaperAlternatives(card, catalogueProducts, deal.price, ["all"]).slice(0, 5);
      setCheaperAlternativesCache((current) => {
        const next = new Map(current);
        next.set(productId, { contextKey, alternatives });
        return next;
      });
      setLoadingCheaperProductIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }, 0);
  }, [catalogueProducts, cheaperAlternativesCache, itemCards, loadingCheaperProductIds, selectedSupermarkets, sortMode, watchlistItems]);

  const handleWatchlistTabChange = useCallback((tab: WatchlistTab) => {
    setActiveWatchlistTab(tab);
    if (tab === "cheaper-options") {
      // Cheaper Options is anchored to the product's primary offer. Keep it
      // in the flat product view so a supermarket section can never show
      // alternatives calculated from another store's price.
      setWatchlistView("all");
      loadCheaperOptions();
    } else {
      setExpandedCheaperProductIds(new Set());
    }
  }, [loadCheaperOptions]);

  useEffect(() => {
    if (!user) return;
    const returnContext = consumeWatchlistReturnContext();
    if (!returnContext) return;

    watchlistReturnContextRef.current = returnContext;
    const timer = window.setTimeout(() => {
      setActiveWatchlistTab(returnContext.tab);
      setExpandedCheaperProductIds(new Set([returnContext.expandedProductId]));
      loadCheaperOptions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCheaperOptions, user]);

  const toggleCheaperOptions = useCallback((productId: string) => {
    const shouldExpand = !expandedCheaperProductIds.has(productId);
    setExpandedCheaperProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    if (!shouldExpand) return;
    if (catalogueProducts) prepareCheaperOptions(productId);
    else loadCheaperOptions();
  }, [catalogueProducts, expandedCheaperProductIds, loadCheaperOptions, prepareCheaperOptions]);

  useEffect(() => {
    if (activeWatchlistTab !== "cheaper-options" || !catalogueProducts) return;
    const timer = window.setTimeout(() => {
      for (const productId of expandedCheaperProductIds) prepareCheaperOptions(productId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeWatchlistTab, catalogueProducts, expandedCheaperProductIds, prepareCheaperOptions]);

  useEffect(() => {
    const returnContext = watchlistReturnContextRef.current;
    if (
      !returnContext ||
      watchlistReturnRestoredRef.current ||
      loadingWatchlist ||
      loadingCheaperProductIds.has(returnContext.expandedProductId)
    ) {
      return;
    }

    const item = watchlistItems.find((entry) => entry.productId === returnContext.expandedProductId);
    const card = itemCards.get(returnContext.expandedProductId);
    const deal = item ? watchlistItemDeal(item, itemCards, selectedSupermarkets, undefined, sortMode) : undefined;
    const cached = cheaperAlternativesCache.get(returnContext.expandedProductId);
    if (!item || !card || !deal) return;

    const expectedContextKey = cheaperOptionsContextKey(card, deal);
    if (catalogueProducts && (!cached || cached.contextKey !== expectedContextKey)) return;
    if (!catalogueProducts && !cheaperOptionsError) return;

    const scrollSurface = document.querySelector<HTMLElement>(".mobile-scroll-surface");
    if (!scrollSurface) return;

    const restoreScrollPosition = () => {
      scrollSurface.scrollTop = Math.min(
        returnContext.scrollTop,
        Math.max(0, scrollSurface.scrollHeight - scrollSurface.clientHeight),
      );
    };

    restoreScrollPosition();
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      restoreScrollPosition();
      secondFrame = window.requestAnimationFrame(() => {
        restoreScrollPosition();
        watchlistReturnRestoredRef.current = true;
        watchlistReturnContextRef.current = null;
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [catalogueProducts, cheaperAlternativesCache, cheaperOptionsError, itemCards, loadingCheaperProductIds, loadingWatchlist, selectedSupermarkets, sortMode, watchlistItems]);

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

  const pulseSummary = useMemo<WatchlistPulseSummary>(() => buildWatchlistPulse(
    watchlistItems.map((item) => {
      const deals = itemCards.get(item.productId)?.currentDeals ?? [];
      const displayedDeal = watchlistItemDeal(item, itemCards, ["all"], undefined, "best");
      const orderedDeals = displayedDeal
        ? [displayedDeal, ...deals.filter((deal) => deal !== displayedDeal)]
        : deals;
      return {
        productId: item.productId,
        verdicts: orderedDeals.map((deal) => getAssessmentVerdict(deal)),
        offers: orderedDeals.map((deal) => ({ storeId: canonicalStoreKey(deal.store), price: deal.price })),
        verdictOffers: orderedDeals.map((deal) => ({ storeId: canonicalStoreKey(deal.store), verdict: getAssessmentVerdict(deal) })),
      };
    }),
    unreadAlerts.map((alert) => ({ productId: alert.product_id, eventType: alert.event_type })),
  ), [itemCards, unreadAlerts, watchlistItems]);

  const filteredItems = useMemo(
    () => sortWatchlistItems(
      watchlistItems.filter((item) => {
        const category = watchlistCategory(productMeta.get(item.productId));
        const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(category);
        const deals = itemCards.get(item.productId)?.currentDeals ?? [];
        const matchesSupermarket = selectedSupermarkets.includes("all") || deals.some((deal) => matchesAnySelectedStore(deal.store, selectedSupermarkets));
        const matchesPulse = !activePulse || pulseSummary.productIds[activePulse].has(item.productId);
        return matchesCategory && matchesSupermarket && matchesPulse;
      }),
      sortMode,
      itemCards,
      filterSupermarkets,
      activePulse ? pulseSummary.preferredStoreIds[activePulse] : undefined,
    ),
    [activePulse, filterSupermarkets, itemCards, productMeta, pulseSummary.preferredStoreIds, pulseSummary.productIds, selectedCategories, selectedSupermarkets, sortMode, watchlistItems],
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
    return `${watchlistView === "by-supermarket" ? "grouped by supermarket" : "shown as all items"}, showing ${supermarketScope}`;
  }, [selectedSupermarkets, supermarkets, watchlistView]);

  const storeKeys = useMemo(() => supermarkets.map(([key]) => key), [supermarkets]);

  useEffect(() => {
    if (!user) {
      storeOrderHydratedRef.current = null;
      const timer = window.setTimeout(() => {
        setOrderedStoreKeys([]);
        setExpandedStoreKeys(new Set());
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (storeOrderHydratedRef.current === user.id) return;
    storeOrderHydratedRef.current = user.id;
    let savedOrder: string[] = [];
    try {
      const raw = window.localStorage.getItem(`${WATCHLIST_STORE_ORDER_KEY}:${user.id}`);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) savedOrder = parsed.filter((value): value is string => typeof value === "string");
    } catch {
      // A storage restriction should not prevent the grouped view from working.
    }
    const nextOrder = normalizeStoreOrder(savedOrder, storeKeys);
    setOrderedStoreKeys(nextOrder);
    setExpandedStoreKeys(new Set(nextOrder));
  }, [storeKeys, user]);

  useEffect(() => {
    if (!user || storeOrderHydratedRef.current !== user.id) return;
    setOrderedStoreKeys((current) => normalizeStoreOrder(current, storeKeys));
    setExpandedStoreKeys((current) => {
      const next = new Set([...current].filter((key) => storeKeys.includes(key)));
      for (const key of storeKeys) if (!current.size) next.add(key);
      return next;
    });
  }, [storeKeys, user]);

  const orderedSupermarkets = useMemo(() => {
    const byKey = new Map(supermarkets);
    return normalizeStoreOrder(orderedStoreKeys, storeKeys).map((key) => [key, byKey.get(key) ?? key] as const);
  }, [orderedStoreKeys, storeKeys, supermarkets]);

  const persistStoreOrder = useCallback((nextOrder: string[], announcement = "Supermarket order updated.") => {
    setOrderedStoreKeys(nextOrder);
    setReorderAnnouncement(announcement);
    if (!user) return;
    try {
      window.localStorage.setItem(`${WATCHLIST_STORE_ORDER_KEY}:${user.id}`, JSON.stringify(nextOrder));
    } catch {
      // Reordering remains available for this session when storage is unavailable.
    }
  }, [user]);

  const persistVisibleStoreOrder = useCallback((visibleOrder: string[]) => {
    const current = normalizeStoreOrder(orderedStoreKeys, storeKeys);
    const visible = new Set(visibleOrder);
    let visibleIndex = 0;
    const next = current.map((key) => visible.has(key) ? visibleOrder[visibleIndex++] : key);
    persistStoreOrder(next);
  }, [orderedStoreKeys, persistStoreOrder, storeKeys]);

  const moveStore = useCallback((key: string, direction: -1 | 1, visibleOrder?: string[]) => {
    const current = normalizeStoreOrder(orderedStoreKeys, storeKeys);
    const movementOrder = visibleOrder ?? current;
    const index = movementOrder.indexOf(key);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= movementOrder.length) return;
    const nextVisibleOrder = [...movementOrder];
    [nextVisibleOrder[index], nextVisibleOrder[nextIndex]] = [nextVisibleOrder[nextIndex], nextVisibleOrder[index]];
    const visibleKeys = new Set(movementOrder);
    let visibleIndex = 0;
    const next = current.map((storeKey) => visibleKeys.has(storeKey) ? nextVisibleOrder[visibleIndex++] : storeKey);
    const movedStoreLabel = supermarkets.find(([storeKey]) => storeKey === key)?.[1] ?? key;
    persistStoreOrder(next, `${movedStoreLabel} moved to position ${nextIndex + 1} of ${movementOrder.length}.`);
  }, [orderedStoreKeys, persistStoreOrder, storeKeys, supermarkets]);

  const handlePulseSelect = useCallback((kind: WatchlistPulseKind) => {
    setActiveWatchlistTab("watchlist");
    setActivePulse((current) => current === kind ? null : kind);
  }, []);

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
    () => filteredItems.filter((item) => watchlistItemDeal(item, itemCards, filterSupermarkets, activePulse ? pulseSummary.preferredStoreIds[activePulse].get(item.productId) : undefined, sortMode)?.isOnSpecial === true),
    [activePulse, filterSupermarkets, filteredItems, itemCards, pulseSummary.preferredStoreIds, sortMode],
  );
  const inactiveItems = useMemo(
    () => filteredItems.filter((item) => watchlistItemDeal(item, itemCards, filterSupermarkets, activePulse ? pulseSummary.preferredStoreIds[activePulse].get(item.productId) : undefined, sortMode)?.isOnSpecial !== true),
    [activePulse, filterSupermarkets, filteredItems, itemCards, pulseSummary.preferredStoreIds, sortMode],
  );
  const groupedSupermarkets = useMemo(
    () => orderedSupermarkets.filter(([storeKey]) => filteredItems.some((entry) => (itemCards.get(entry.productId)?.currentDeals ?? []).some((deal) => canonicalStoreKey(deal.store) === storeKey))),
    [filteredItems, itemCards, orderedSupermarkets],
  );
  const renderItem = (entry: WatchlistItem, storeKey?: string) => {
    const card = itemCards.get(entry.productId);
    const meta = productMeta.get(entry.productId);
    const preferredPulseStore = !storeKey && activePulse ? pulseSummary.preferredStoreIds[activePulse].get(entry.productId) : undefined;
    const deal = card ? watchlistItemDeal(entry, itemCards, storeKey ? [storeKey] : filterSupermarkets, preferredPulseStore, sortMode) : undefined;
    const sourceItem = entry.sourceItems[0];
    const isUnread = entry.sourceItems.some((item) => unreadListItemKeys.has(`${item.list_id}:${item.id}`));
    const onViewed = () => void Promise.all(entry.sourceItems.map((item) => markListItemViewed(item.list_id, item.id)));
    const currentCheaperOptionsKey = card && deal ? cheaperOptionsContextKey(card, deal) : "";
    const cachedCheaperOptions = cheaperAlternativesCache.get(entry.productId);
    const cheaperAlternatives = cachedCheaperOptions?.contextKey === currentCheaperOptionsKey ? cachedCheaperOptions.alternatives : [];
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
              showCheaperOptions={activeWatchlistTab === "cheaper-options" && watchlistView === "all"}
              cheaperAlternatives={cheaperAlternatives}
              cheaperOptionsExpanded={expandedCheaperProductIds.has(entry.productId)}
              onToggleCheaperOptions={() => toggleCheaperOptions(entry.productId)}
              cheaperOptionsLoading={(loadingCheaperOptions && catalogueProducts === null) || loadingCheaperProductIds.has(entry.productId)}
              cheaperOptionsError={cheaperOptionsError}
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
          activeTab={activeWatchlistTab}
          onTabChange={handleWatchlistTabChange}
          itemCount={watchlistItems.length}
          newPriceItemCount={newPriceItemCount}
          pulseSummary={pulseSummary}
          activePulse={activePulse}
          onPulseSelect={handlePulseSelect}
          showNotificationSetup={Boolean(watchlistItems.length > 0 && pushAvailableOnDevice && (pushPermissionState !== null || pushReady) && !pushEnabled)}
          notificationPermissionDenied={pushPermissionState === "denied"}
          isSettingUpNotifications={isSettingUpNotifications}
          onSetupNotifications={() => void handleNotificationSetup()}
        />
      </div>

      <div className="watchlist-filter-bar">
        <div className="grid min-w-0 grid-cols-3 gap-1.5 overflow-hidden px-5">
          <div className="min-w-0">
            <WatchlistViewPicker
              view={watchlistView}
              onViewChange={(view) => {
                setWatchlistView(view);
                setActivePulse(null);
                if (view === "by-supermarket" && activeWatchlistTab === "cheaper-options") setActiveWatchlistTab("watchlist");
              }}
              stores={supermarkets.map(([id, label]) => ({ id, label }))}
              selectedStoreIds={selectedSupermarkets}
              onToggleStore={toggleSupermarket}
            />
          </div>
          <div className="min-w-0">
            <CategoryPicker
              selectedCategories={selectedCategories}
              onChange={setSelectedCategories}
              availableCategories={categories}
              categoryCounts={categoryCounts}
              align="left"
            />
          </div>
          <div className="min-w-0">
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
              align="left"
            />
          </div>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {activePulse
          ? `${pulseLabel(activePulse, pulseSummary.counts[activePulse])} selected. Showing ${filteredItems.length} matching ${filteredItems.length === 1 ? "item" : "items"}; ${viewStatusDescription}.`
          : selectedCategories.length > 0
            ? `Showing ${filteredItems.length} of ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}; ${viewStatusDescription}.`
            : `Watching ${watchlistItems.length} ${watchlistItems.length === 1 ? "item" : "items"}; ${viewStatusDescription}.`}
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
        {!loadingWatchlist && !error && filteredItems.length > 0 && watchlistView === "all" && (
          <div className="flex flex-col gap-2 px-5">
            <AnimatePresence initial={false}>
              {activeItems.map((entry) => renderItem(entry))}
              {inactiveItems.length > 0 && (
                <motion.h2
                  key="not-on-special-heading"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="mt-3 px-1 text-[12px] font-extrabold uppercase tracking-[0.12em] text-stone-400"
                >
                  Not on special
                </motion.h2>
              )}
              {inactiveItems.map((entry) => renderItem(entry))}
            </AnimatePresence>
          </div>
        )}
        {!loadingWatchlist && !error && filteredItems.length > 0 && watchlistView === "by-supermarket" && (
          <div className="px-5">
            <p className="sr-only" aria-live="polite">{reorderAnnouncement}</p>
            <Reorder.Group axis="y" values={groupedSupermarkets.map(([key]) => key)} onReorder={persistVisibleStoreOrder} aria-label="Reorder supermarkets" className="flex flex-col gap-2">
              {groupedSupermarkets.map(([storeKey, storeLabel], index) => {
                const storeItems = filteredItems.filter((entry) => (itemCards.get(entry.productId)?.currentDeals ?? []).some((deal) => canonicalStoreKey(deal.store) === storeKey));
                return (
                  <WatchlistSupermarketSection
                    key={storeKey}
                    storeKey={storeKey}
                    storeLabel={storeLabel}
                    itemCount={storeItems.length}
                    entries={storeItems}
                    isExpanded={expandedStoreKeys.has(storeKey)}
                    canMoveUp={index > 0}
                    canMoveDown={index < groupedSupermarkets.length - 1}
                    onToggle={() => setExpandedStoreKeys((current) => {
                      const next = new Set(current);
                      if (next.has(storeKey)) next.delete(storeKey);
                      else next.add(storeKey);
                      return next;
                    })}
                    onMoveUp={() => moveStore(storeKey, -1, groupedSupermarkets.map(([key]) => key))}
                    onMoveDown={() => moveStore(storeKey, 1, groupedSupermarkets.map(([key]) => key))}
                    renderItem={renderItem}
                  />
                );
              })}
            </Reorder.Group>
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
  pulseSummary,
  activePulse,
  onPulseSelect,
  showNotificationSetup,
  notificationPermissionDenied,
  isSettingUpNotifications,
  onSetupNotifications,
}: {
  activeTab: WatchlistTab;
  onTabChange: (tab: WatchlistTab) => void;
  itemCount: number;
  newPriceItemCount: number;
  pulseSummary: WatchlistPulseSummary;
  activePulse: WatchlistPulseKind | null;
  onPulseSelect: (kind: WatchlistPulseKind) => void;
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
        className="dd-segmented-control relative flex h-11 w-full items-center gap-0.5 rounded-full bg-white ring-1 ring-stone-200 shadow-sm shadow-black/5"
        role="group"
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
              aria-pressed={isActive}
              onClick={() => onTabChange(tab)}
              className={[
                "relative z-0 flex h-11 flex-1 cursor-pointer appearance-none items-center justify-center rounded-full px-3 py-1 text-center dd-type-control transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1",
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
      {!isEmpty && pulseSummary.counts && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Watchlist updates">
          {WATCHLIST_PULSE_ORDER.map((kind) => {
            const count = pulseSummary.counts[kind];
            if (count < 1) return null;
            const isActive = activePulse === kind;
            const verdictTone = kind === "real-savers"
              ? "border-fair-600 bg-fair-50 text-fair-800"
              : kind === "dodgy-deals"
                ? "border-alert-600 bg-alert-50 text-alert-800"
                : "border-stone-200 bg-stone-50 text-stone-700";
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onPulseSelect(kind)}
                aria-pressed={isActive}
                aria-label={`${isActive ? "Clear" : "Show"} ${pulseLabel(kind, count)} in your Watchlist${kind === "cheaper-elsewhere" ? " — a lower current price at another supermarket than the offer shown" : ""}`}
                className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-left text-xs font-extrabold transition-[filter,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-offset-1 ${verdictTone} ${isActive ? "brightness-95 shadow-inner" : "hover:brightness-95"}`}
              >
                <span>{pulseLabel(kind, count)}</span>
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      {!isEmpty && <p className="sr-only">Real Saver and Dodgy Deal pills describe the current verdicts. Back on special and Price drop pills describe new updates since your last visit.</p>}
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

function WatchlistSupermarketSection({
  storeKey,
  storeLabel,
  itemCount,
  entries,
  isExpanded,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMoveUp,
  onMoveDown,
  renderItem,
}: {
  storeKey: string;
  storeLabel: string;
  itemCount: number;
  entries: WatchlistItem[];
  isExpanded: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  renderItem: (entry: WatchlistItem, storeKey?: string) => ReactNode;
}) {
  const dragControls = useDragControls();
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const sectionContentId = `watchlist-store-section-${storeKey.replace(/[^a-z0-9_-]/gi, "-")}`;

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  useEffect(() => () => {
    clearLongPress();
    didLongPressRef.current = false;
    longPressOriginRef.current = null;
  }, []);

  const startLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearLongPress();
    didLongPressRef.current = false;
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    const nativeEvent = event.nativeEvent;
    longPressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      dragControls.start(nativeEvent);
    }, 420);
  };

  const handleSectionPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (didLongPressRef.current) return;
    const origin = longPressOriginRef.current;
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) {
      clearLongPress();
      longPressOriginRef.current = null;
    }
  };

  const stopLongPress = () => {
    clearLongPress();
    longPressOriginRef.current = null;
  };

  const handleSectionClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (didLongPressRef.current) {
      event.preventDefault();
      event.stopPropagation();
      didLongPressRef.current = false;
      return;
    }
    onToggle();
  };

  const handleSectionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && canMoveUp) onMoveUp();
    if (event.key === "ArrowDown" && canMoveDown) onMoveDown();
  };

  return (
    <Reorder.Item
      value={storeKey}
      dragListener={false}
      dragControls={dragControls}
      className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white"
      layout
    >
      <button
        type="button"
        onClick={handleSectionClick}
        onPointerDown={startLongPress}
        onPointerMove={handleSectionPointerMove}
        onPointerUp={stopLongPress}
        onPointerCancel={stopLongPress}
        onPointerLeave={stopLongPress}
        onKeyDown={handleSectionKeyDown}
        onContextMenu={(event) => event.preventDefault()}
        aria-expanded={isExpanded}
        aria-controls={sectionContentId}
        aria-label={`${storeLabel}, ${itemCount} ${itemCount === 1 ? "product" : "products"}. ${isExpanded ? "Collapse" : "Expand"} section. Hold to reorder.`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        title="Tap to expand or collapse. Hold to reorder."
        className="flex min-h-11 w-full touch-none items-center gap-2 border-b border-stone-100 px-4 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-600 focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-stone-900">{storeLabel}</span>
        <span className="shrink-0 text-xs font-semibold text-stone-400">{itemCount} {itemCount === 1 ? "product" : "products"}</span>
        {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />}
      </button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="section-content"
            id={sectionContentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 p-2">
              <AnimatePresence initial={false}>{entries.map((entry) => renderItem(entry, storeKey))}</AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
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
