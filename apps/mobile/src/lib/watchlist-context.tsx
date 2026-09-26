"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  addItemToList,
  createList,
  fetchItemsForLists,
  fetchUserLists,
  invalidateListsPageCache,
  LIST_MEMBERSHIP_CHANGED_EVENT,
  removeItemFromList,
  type ListRow,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/notifications-context";
import { requireAccountsSupabaseClient } from "@/lib/accounts-supabase-client";
import { describeFetchError } from "@dodgey-deals/shared";
import WatchlistNotificationSheet from "@/components/WatchlistNotificationSheet";

interface WatchlistContextValue {
  savedProductIds: ReadonlySet<string>;
  selectedProductIds: ReadonlySet<string>;
  loadingSavedItems: boolean;
  isCommitting: boolean;
  removingProductIds: ReadonlySet<string>;
  error: string | null;
  confirmation: string | null;
  toggleProduct: (productId: string) => void;
  removeProduct: (productId: string) => Promise<void>;
  clearSelection: () => void;
  dismissSelectionBar: () => void;
  commitSelection: () => Promise<void>;
  refreshSavedItems: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

function isWatchlist(list: ListRow): boolean {
  return list.name.trim().toLocaleLowerCase() === "watchlist";
}

/**
 * Coordinates staged Watchlist selection across every product card in the
 * app. Selection is intentionally local until the user taps the anchored
 * action bar, so a browsing session never creates partial list writes.
 * Existing list rows remain readable for backwards compatibility; new items
 * go into one auto-created `Watchlist` list so the existing price-alert
 * processor continues to work without a schema migration.
 */
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const {
    pushEnabled,
    pushReady,
    pushAvailableOnDevice,
    pushPermissionState,
    notificationError,
    setPushEnabled,
    openNotificationSettings,
  } = useNotifications();
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [loadingSavedItems, setLoadingSavedItems] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [removingProductIds, setRemovingProductIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [notificationPromptPending, setNotificationPromptPending] = useState(false);
  const [isNotificationPromptOpen, setIsNotificationPromptOpen] = useState(false);
  const [notificationPromptItemCount, setNotificationPromptItemCount] = useState(1);
  const [notificationPromptUserId, setNotificationPromptUserId] = useState<string | null>(null);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  const notificationPromptStorageKey = user ? `dodgey-deals:watchlist-notification-prompted:${user.id}` : null;

  useEffect(() => {
    if (!notificationPromptPending || !user || pushEnabled || !pushAvailableOnDevice || !pushReady) return;
    try {
      if (notificationPromptStorageKey && window.localStorage.getItem(notificationPromptStorageKey) === "1") {
        return;
      }
    } catch {
      // Private browsing/storage restrictions should not block the prompt.
    }

    const timer = window.setTimeout(() => {
      try {
        if (notificationPromptStorageKey) window.localStorage.setItem(notificationPromptStorageKey, "1");
      } catch {
        // The prompt can still be shown when local storage is unavailable.
      }
      setNotificationPromptPending(false);
      setIsNotificationPromptOpen(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [notificationPromptPending, notificationPromptStorageKey, pushAvailableOnDevice, pushEnabled, pushReady, user]);

  const refreshSavedItems = useCallback(async () => {
    if (!user) {
      setSavedProductIds(new Set());
      setSelectedProductIds(new Set());
      return;
    }

    setLoadingSavedItems(true);
    try {
      const client = requireAccountsSupabaseClient();
      const lists = await fetchUserLists(client);
      const items = await fetchItemsForLists(client, lists.map((list) => list.id));
      setSavedProductIds(new Set(items.map((item) => item.product_id)));
      setError(null);
    } catch (loadError) {
      setError(describeFetchError(loadError, "We couldn't load your Watchlist."));
    } finally {
      setLoadingSavedItems(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshSavedItems(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshSavedItems]);

  useEffect(() => {
    const handleMembershipChanged = () => void refreshSavedItems();
    window.addEventListener(LIST_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
    return () => window.removeEventListener(LIST_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
  }, [refreshSavedItems]);

  useEffect(() => {
    if (!confirmation) return;
    const timer = window.setTimeout(() => setConfirmation(null), 2200);
    return () => window.clearTimeout(timer);
  }, [confirmation]);

  const toggleProduct = useCallback((productId: string) => {
    setError(null);
    setConfirmation(null);
    setSelectedProductIds((current) => {
      if (savedProductIds.has(productId)) return current;
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, [savedProductIds]);

  const removeProduct = useCallback(async (productId: string) => {
    if (!user) return;

    setRemovingProductIds((current) => new Set(current).add(productId));
    setError(null);
    setConfirmation(null);

    try {
      const client = requireAccountsSupabaseClient();
      const lists = await fetchUserLists(client);
      const items = await fetchItemsForLists(client, lists.map((list) => list.id));
      const matchingItems = items.filter((item) => item.product_id === productId);

      await Promise.all(matchingItems.map((item) => removeItemFromList(client, item.list_id, productId)));
      setSavedProductIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
      setSelectedProductIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
      invalidateListsPageCache(user.id);
      window.dispatchEvent(new CustomEvent(LIST_MEMBERSHIP_CHANGED_EVENT, { detail: { source: "watchlist-card" } }));
      setConfirmation("1 item removed from Watchlist");
    } catch (removeError) {
      setError(describeFetchError(removeError, "We couldn't remove that product."));
      throw removeError;
    } finally {
      setRemovingProductIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }
  }, [user]);

  const clearSelection = useCallback(() => {
    if (!isCommitting) setSelectedProductIds(new Set());
  }, [isCommitting]);

  const dismissSelectionBar = useCallback(() => {
    setSelectedProductIds(new Set());
    setConfirmation(null);
    setError(null);
  }, []);

  const commitSelection = useCallback(async () => {
    if (!user || isCommitting || selectedProductIds.size === 0) return;

    setIsCommitting(true);
    setError(null);
    const client = requireAccountsSupabaseClient();
    const pendingIds = [...selectedProductIds].filter((productId) => !savedProductIds.has(productId));

    try {
      const lists = await fetchUserLists(client);
      let watchlist = lists.find(isWatchlist);
      if (!watchlist) watchlist = await createList(client, user.id, "Watchlist");

      const addedIds: string[] = [];
      const failedIds: string[] = [];
      for (const productId of pendingIds) {
        try {
          await addItemToList(client, watchlist.id, productId);
          addedIds.push(productId);
        } catch {
          failedIds.push(productId);
        }
      }

      if (addedIds.length) {
        setSavedProductIds((current) => new Set([...current, ...addedIds]));
        setSelectedProductIds(() => new Set(failedIds.length ? failedIds : []));
        invalidateListsPageCache(user.id);
        window.dispatchEvent(new Event(LIST_MEMBERSHIP_CHANGED_EVENT));
        setConfirmation(`${addedIds.length} ${addedIds.length === 1 ? "item" : "items"} added to Watchlist`);
        if (!pushEnabled) {
          setNotificationPromptItemCount(addedIds.length);
          setNotificationPromptUserId(user.id);
          setNotificationPromptPending(true);
        }
      }
      if (failedIds.length) setError("Some items couldn't be added. Please try again.");
    } catch (commitError) {
      setError(describeFetchError(commitError, "We couldn't update your Watchlist."));
    } finally {
      setIsCommitting(false);
    }
  }, [isCommitting, pushEnabled, savedProductIds, selectedProductIds, user]);

  const value = useMemo<WatchlistContextValue>(() => ({
    savedProductIds,
    selectedProductIds,
    loadingSavedItems,
    isCommitting,
    removingProductIds,
    error,
    confirmation,
    toggleProduct,
    removeProduct,
    clearSelection,
    dismissSelectionBar,
    commitSelection,
    refreshSavedItems,
  }), [
    clearSelection,
    commitSelection,
    confirmation,
    error,
    isCommitting,
    loadingSavedItems,
    removingProductIds,
    removeProduct,
    dismissSelectionBar,
    refreshSavedItems,
    savedProductIds,
    selectedProductIds,
    toggleProduct,
  ]);

  const handleEnableNotifications = async () => {
    setIsSavingNotifications(true);
    try {
      const enabled = await setPushEnabled(true);
      if (enabled) setIsNotificationPromptOpen(false);
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleOpenNotificationSettings = async () => {
    setIsSavingNotifications(true);
    try {
      await openNotificationSettings();
      setIsNotificationPromptOpen(false);
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <WatchlistContext.Provider value={value}>
      {children}
      <WatchlistSelectionBar />
      <WatchlistNotificationSheet
        open={Boolean(user && !pushEnabled && isNotificationPromptOpen && notificationPromptUserId === user.id)}
        itemCount={notificationPromptItemCount}
        permissionState={pushPermissionState}
        isSaving={isSavingNotifications}
        error={notificationError}
        onClose={() => setIsNotificationPromptOpen(false)}
        onEnable={() => void handleEnableNotifications()}
        onOpenSettings={() => void handleOpenNotificationSettings()}
      />
    </WatchlistContext.Provider>
  );
}

function WatchlistSelectionBar() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const { selectedProductIds, isCommitting, error, confirmation, clearSelection, dismissSelectionBar, commitSelection } = useWatchlist();
  const count = selectedProductIds.size;
  const navIsHidden = pathname.startsWith("/deal/") || pathname === "/settings" || pathname === "/support" || pathname === "/report-deal";
  const showBar = count > 0 || Boolean(confirmation) || Boolean(error);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    dismissSelectionBar();
  }, [dismissSelectionBar, pathname]);

  return (
    <AnimatePresence initial={false}>
      {showBar && (
        <motion.div
          key="watchlist-selection-bar"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: 24,
            transition: { duration: 0.24, ease: [0.4, 0, 1, 1] },
          }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`watchlist-selection-bar fixed inset-x-0 z-[58] mx-auto w-full max-w-[480px] px-4 ${navIsHidden ? "watchlist-selection-bar-no-nav" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl bg-ink-900 p-3 text-white shadow-2xl shadow-black/20">
            {confirmation ? (
              <div className="flex items-center justify-center gap-2 py-1 text-sm font-bold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fair-500 text-ink-900" aria-hidden="true">✓</span>
                {confirmation}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{count} {count === 1 ? "item" : "items"} selected</p>
                  {error && <p className="mt-0.5 text-xs text-red-200">{error}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void commitSelection()}
                  disabled={isCommitting}
                  aria-busy={isCommitting}
                  className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-extrabold text-ink-900 transition-transform active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                >
                  Add to Watchlist
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={isCommitting}
                  aria-label="Clear selected items"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  <span aria-hidden="true" className="text-xl leading-none">×</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useWatchlist(): WatchlistContextValue {
  const context = useContext(WatchlistContext);
  if (!context) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return context;
}
