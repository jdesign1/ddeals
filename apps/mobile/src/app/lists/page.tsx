"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter, Share, SlidersHorizontal } from "lucide-react";
import {
  describeFetchError,
  invalidateListsPageCache,
  loadListsPageData,
  LIST_MEMBERSHIP_CHANGED_EVENT,
  removeItemFromList,
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
import { AnimatePresence, motion } from "motion/react";

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

function itemDiscount(item: WatchlistItem, itemCards: Map<string, ProductCardData>): number {
  return itemCards.get(item.productId)?.currentDeals[0]?.discountPercentage ?? 0;
}

function sortItems(items: WatchlistItem[], sortMode: SortMode, itemCards: Map<string, ProductCardData>) {
  return [...items].sort((a, b) => {
    if (sortMode === "discount") {
      const discountDifference = itemDiscount(b, itemCards) - itemDiscount(a, itemCards);
      if (discountDifference !== 0) return discountDifference;
    }
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });
}

function displayCategory(category: string): string {
  return category
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default function ListsPage() {
  const { user, loading: authLoading, openAuthSheet } = useAuth();
  const { unreadListItemKeys, markListItemViewed } = useNotifications();
  const [itemsByList, setItemsByList] = useState<Map<string, ListItemRow[]>>(new Map());
  const [productMeta, setProductMeta] = useState<Map<string, ListItemProductMeta>>(new Map());
  const [itemCards, setItemCards] = useState<Map<string, ProductCardData>>(new Map());
  const [lowestPriceByProduct, setLowestPriceByProduct] = useState<Map<string, ListItemLowestPrice>>(new Map());
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [groupByStore, setGroupByStore] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All categories");
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);

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

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const item of watchlistItems) {
      const category = productMeta.get(item.productId)?.category;
      if (category) values.add(category);
    }
    return ["All categories", ...[...values].sort((a, b) => displayCategory(a).localeCompare(displayCategory(b)))];
  }, [productMeta, watchlistItems]);

  const filteredItems = useMemo(
    () => sortItems(
      watchlistItems.filter((item) => selectedCategory === "All categories" || productMeta.get(item.productId)?.category === selectedCategory),
      sortMode,
      itemCards,
    ),
    [itemCards, productMeta, selectedCategory, sortMode, watchlistItems],
  );

  const groups = useMemo<WatchlistGroup[]>(() => {
    if (!groupByStore) return [{ key: "all", label: "All saved products", items: filteredItems }];
    const grouped = new Map<string, WatchlistItem[]>();
    for (const item of filteredItems) {
      const store = itemCards.get(item.productId)?.currentDeals[0]?.store ?? "Price unavailable";
      const key = store === "Price unavailable" ? "price-unavailable" : store.toLowerCase();
      const existing = grouped.get(key) ?? [];
      existing.push(item);
      grouped.set(key, existing);
    }
    return [...grouped.entries()]
      .sort(([keyA], [keyB]) => (keyA === "price-unavailable" ? 1 : keyB === "price-unavailable" ? -1 : keyA.localeCompare(keyB)))
      .map(([key, items]) => ({ key, label: key === "price-unavailable" ? "Price unavailable" : itemCards.get(items[0].productId)?.currentDeals[0]?.store ?? key, items }));
  }, [filteredItems, groupByStore, itemCards]);

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
      <SearchBar variant="shadow" compact placeholder="Search for products to watch" sticky={false} backgroundClassName="page-paper-surface" />

      <section className="mx-5 rounded-2xl bg-white px-4 py-4 shadow-sm" aria-labelledby="watchlist-intro-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 id="watchlist-intro-title" className="font-display text-lg font-extrabold text-stone-900">Your Watchlist</h1>
            <p className="mt-1 text-[13px] leading-5 text-stone-500">Save products once. We&rsquo;ll keep an eye out for a better special price.</p>
          </div>
          <button type="button" onClick={() => setIsShareSheetOpen(true)} disabled={watchlistItems.length === 0} aria-label="Share Watchlist" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"><Share className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[13px] font-bold text-stone-600">
          <span>{watchlistItems.length} {watchlistItems.length === 1 ? "product" : "products"}</span>
          {sortMode === "discount" && <span className="text-stone-400">· Largest discount first</span>}
          {sortMode === "recent" && <span className="text-stone-400">· Newest first</span>}
        </div>
      </section>

      <div className="flex items-center gap-2 px-5">
        <button type="button" onClick={() => setIsSortSheetOpen(true)} disabled={watchlistItems.length === 0} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-[13px] font-bold text-stone-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Sort: {sortMode === "recent" ? "Date added" : "Discount"}<ChevronDown className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={() => setGroupByStore((current) => !current)} disabled={watchlistItems.length === 0} aria-pressed={groupByStore} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-[13px] font-bold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${groupByStore ? "border-ink-900 bg-ink-900 text-white" : "border-stone-200 bg-white text-stone-700"}`}><span aria-hidden="true">▦</span>Stores</button>
      </div>

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Filter Watchlist by category">
          {categories.map((category) => {
            const selected = selectedCategory === category;
            return <button key={category} type="button" aria-pressed={selected} onClick={() => setSelectedCategory(category)} className={`shrink-0 rounded-full border px-3 py-2 text-[12px] font-bold transition-colors ${selected ? "border-ink-900 bg-ink-900 text-white" : "border-stone-200 bg-white text-stone-600"}`}><Filter className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />{category === "All categories" ? category : displayCategory(category)}</button>;
          })}
        </div>
      )}

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
          <div className="flex flex-col gap-5 px-5">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`watchlist-group-${group.key}`}>
                {groupByStore && <h2 id={`watchlist-group-${group.key}`} className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.12em] text-stone-500">{group.label} <span className="font-medium tracking-normal">· {group.items.length}</span></h2>}
                <div className="flex flex-col gap-2">
                  {group.items.map((entry) => {
                    const card = itemCards.get(entry.productId);
                    const meta = productMeta.get(entry.productId);
                    const sourceItem = entry.sourceItems[0];
                    const isUnread = entry.sourceItems.some((item) => unreadListItemKeys.has(`${item.list_id}:${item.id}`));
                    const onViewed = () => void Promise.all(entry.sourceItems.map((item) => markListItemViewed(item.list_id, item.id)));
                    return (
                      <div key={entry.productId} data-watchlist-product-id={entry.productId}>
                        <UnreadListItem listId={sourceItem.list_id} productId={entry.productId} isUnread={isUnread} onViewed={onViewed}>
                          {card ? (
                            <ListItemProductCard product={card} deal={card.currentDeals[0]} quantity={entry.item.quantity} onRemove={() => void removeProduct(entry.productId)} removeLabel={`Remove ${meta?.name ?? "product"} from Watchlist`} onAfterNotOnSpecial={() => void reload(false)} />
                          ) : (
                            <FallbackWatchlistRow label={meta?.name ?? "Product"} onRemove={() => void removeProduct(entry.productId)} />
                          )}
                        </UnreadListItem>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <ShareListsSheet open={isShareSheetOpen} lists={watchlistItems.length ? [shareList] : []} itemsByList={shareItems} productMeta={productMeta} lowestPriceByProduct={lowestPriceByProduct} onClose={() => setIsShareSheetOpen(false)} />
      <SortSheet open={isSortSheetOpen} sortMode={sortMode} onSelect={(next) => { setSortMode(next); setIsSortSheetOpen(false); }} onClose={() => setIsSortSheetOpen(false)} />
    </main>
  );
}

function FallbackWatchlistRow({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200/80 bg-white px-3 py-3 grayscale opacity-60"><span className="min-w-0 text-sm font-semibold text-stone-700">{label}<span className="mt-0.5 block text-xs font-medium text-stone-500">Currently unavailable</span></span><button type="button" onClick={onRemove} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-stone-600 hover:bg-stone-100">Remove</button></div>;
}

function SortSheet({ open, sortMode, onSelect, onClose }: { open: boolean; sortMode: SortMode; onSelect: (mode: SortMode) => void; onClose: () => void }) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && <>
          <motion.button type="button" aria-label="Close sort options" onClick={onClose} className="dd-bottom-sheet-backdrop fixed inset-0 z-50 mx-auto w-full max-w-[480px] bg-stone-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.section role="dialog" aria-modal="true" aria-labelledby="watchlist-sort-title" className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[51] mx-auto w-full max-w-[480px] rounded-t-3xl shadow-2xl" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 220 }}>
            <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-100 px-5 py-4"><h3 id="watchlist-sort-title" className="dd-type-sheet-title text-stone-900">Sort Watchlist</h3><button type="button" aria-label="Close" onClick={onClose} className="rounded-full px-2 text-2xl text-stone-500">×</button></div>
            <div className="flex flex-col gap-2 px-5 py-4 pb-safe-sm">
              {([["recent", "Date added"], ["discount", "Largest discount"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={sortMode === value} onClick={() => onSelect(value)} className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-left text-sm font-bold ${sortMode === value ? "bg-ink-900 text-white" : "bg-stone-50 text-stone-700"}`}><span>{label}</span>{sortMode === value && <span aria-hidden="true">✓</span>}</button>)}
            </div>
          </motion.section>
        </>}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
